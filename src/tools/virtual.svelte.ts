// Long tables (Prices, Crafting): paged loading plus window-scrolling virtualization.
//
// Paging: the table starts with the first 50 rows; scrolling near the end of them adds the next 50,
// and so on (a "Load more" button does the same, for keyboards and as a fallback). A new search, filter
// or sort starts again at 50.
// Virtualization: of the rows loaded so far, only the ones near the screen are in the DOM. Two spacer
// rows (above and below) stand in for the rest, so the page keeps its height. Row heights are measured
// as they render, so rows of any height work, including the mobile card layout and Crafting's
// expanded detail rows. The page itself scrolls, as before.
//
// Use:
//   const v = new VirtualRows(() => list, (r) => r.id);
//   …status "Showing {v.shown} of {list.length}"; after the table: {#if v.hasMore}<button onclick={() => v.loadMore()}>{/if}
//   <tbody class="v-body" bind:this={v.body}>
//     {#if v.padTop}<tr class="v-pad" aria-hidden="true"><td colspan="9" style:height="{v.padTop}px"></td></tr>{/if}
//     {#each v.slice as r (r.id)}<tr {@attach v.measure(r.id)}>…</tr>{/each}
//     {#if v.padBottom}…the same with v.padBottom…{/if}
//   </tbody>
// Several <tr>s may share one key (a row and its detail row): their heights are added up.
import { onMount } from "svelte";
import type { Attachment } from "svelte/attachments";

type Key = string | number;

export class VirtualRows<T> {
  /** the <tbody> the rows are drawn in */
  body = $state<HTMLElement | null>(null);
  /** first and one-past-last index to render */
  start = $state(0);
  end = $state(0);
  padTop = $state(0);
  padBottom = $state(0);
  /** how many rows are loaded (grows by pageSize as you scroll) */
  loaded = $state(0);
  /** the rows to render now */
  readonly slice = $derived.by(() => this.#rows().slice(this.start, this.end));
  /** rows loaded so far, at most the whole list */
  readonly shown = $derived.by(() => Math.min(this.loaded, this.#rows().length));
  readonly hasMore = $derived.by(() => this.loaded < this.#rows().length);

  #rows: () => readonly T[];
  #key: (row: T) => Key;
  #overscan: number;
  #estimate: number;
  #pageSize: number;
  /** the list the paging was last reset for */
  #lastRows: readonly T[] | null = null;
  /** rendered elements of each row, and each element's measured height */
  #live = new Map<Key, Set<HTMLElement>>();
  #el = new Map<HTMLElement, number>();
  #nodeKey = new Map<HTMLElement, Key>();
  /** a row's full height the last time it was measured (kept while it is scrolled away) */
  #height = new Map<Key, number>();
  #observer: ResizeObserver | null = null;
  #frame = 0;
  /** bumped when a measurement changes, so the range is worked out again */
  #version = $state(0);
  /** prefix sums: #offsets[i] = top of row i from the start of the list */
  #offsets: number[] = [0];

  /**
   * @param rows the whole list, already filtered and sorted
   * @param key stable key of a row (the same one the {#each} block uses)
   * @param estimate starting guess for a row's height in px, until rows are measured
   * @param pageSize rows loaded at first, and added each time you scroll near the end
   * @param overscan extra px drawn above and below the screen, so fast scrolling doesn't show gaps
   */
  constructor(rows: () => readonly T[], key: (row: T) => Key, estimate = 48, pageSize = 50, overscan = 900) {
    this.#rows = rows;
    this.#key = key;
    this.#estimate = estimate;
    this.#pageSize = pageSize;
    this.#overscan = overscan;
    this.loaded = pageSize;
    this.end = pageSize; // first paint, before anything is measured

    onMount(() => {
      this.#observer = new ResizeObserver((entries) => {
        const touched = new Map<Key, { before: number; above: boolean }>();
        for (const e of entries) {
          const node = e.target as HTMLElement, k = this.#keyOfNode(node);
          if (k == null || !this.#el.has(node)) continue;
          const h = node.offsetHeight;
          if (h === this.#el.get(node)) continue;
          if (!touched.has(k)) touched.set(k, { before: this.#height.get(k) ?? this.#guess(), above: node.getBoundingClientRect().top < 0 });
          this.#el.set(node, h);
          this.#remember(k);
        }
        if (!touched.size) return;
        // rows above the screen that changed height: move the page by as much, so what you're reading stays put
        let shift = 0;
        for (const [k, t] of touched) if (t.above) shift += (this.#height.get(k) ?? 0) - t.before;
        if (shift && this.#viewTop() > 0) window.scrollBy({ top: shift, behavior: "instant" });
        this.#version++;
      });
      for (const node of this.#el.keys()) this.#observer.observe(node);
      const onScroll = () => {
        if (!this.#frame) this.#frame = requestAnimationFrame(() => { this.#frame = 0; this.#update(); });
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      return () => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
        cancelAnimationFrame(this.#frame);
        this.#observer?.disconnect();
      };
    });

    // work the range out again when the list (filter, sort), a measurement, the paging or the table changes;
    // a different list (new search, filter or sort) starts again at the first page
    $effect(() => {
      const rows = this.#rows();
      if (rows !== this.#lastRows) {
        if (this.#lastRows) this.loaded = this.#pageSize;
        this.#lastRows = rows;
      }
      this.#version;
      this.loaded;
      if (this.body) this.#update();
    });
  }

  #keyOfNode(node: HTMLElement): Key | null {
    return this.#nodeKey.get(node) ?? null;
  }

  /** store a row's height as the sum of its rendered parts */
  #remember(k: Key) {
    const set = this.#live.get(k);
    if (!set?.size) return;
    let h = 0;
    for (const n of set) h += this.#el.get(n) || 0;
    if (h) this.#height.set(k, h);
  }

  #guess(): number {
    if (!this.#height.size) return this.#estimate;
    let sum = 0;
    for (const h of this.#height.values()) sum += h;
    return sum / this.#height.size;
  }

  /** px from the top of the list to the top of the window */
  #viewTop(): number {
    return this.body ? -this.body.getBoundingClientRect().top : 0;
  }

  #update() {
    if (typeof window === "undefined" || !this.body) return;
    const rows = this.#rows(), n = Math.min(rows.length, this.loaded), guess = this.#guess();
    const offs = new Array<number>(n + 1);
    offs[0] = 0;
    for (let i = 0; i < n; i++) offs[i + 1] = offs[i] + (this.#height.get(this.#key(rows[i])) ?? guess);
    this.#offsets = offs;

    const view = this.#viewTop();
    const start = Math.min(n, Math.max(0, upperBound(offs, view - this.#overscan) - 1));
    const end = Math.min(n, Math.max(upperBound(offs, view + window.innerHeight + this.#overscan), start + 1));
    this.start = start;
    this.end = end;
    this.padTop = offs[start];
    this.padBottom = offs[n] - offs[end];
    // within a screen of the last loaded row: load the next page (this runs again once it's in)
    if (n < rows.length && offs[n] - view < window.innerHeight * 2) this.loaded = n + this.#pageSize;
  }

  /** Load the next page now (the "Load more" button). */
  loadMore() {
    this.loaded = Math.min(this.#rows().length, this.loaded + this.#pageSize);
  }

  /** Attachment for each rendered <tr>: measures it under its row's key. */
  measure = (key: Key): Attachment<HTMLElement> => (node) => {
    let set = this.#live.get(key);
    if (!set) this.#live.set(key, (set = new Set()));
    set.add(node);
    this.#el.set(node, 0);
    this.#nodeKey.set(node, key);
    this.#observer?.observe(node);
    return () => {
      this.#observer?.unobserve(node);
      this.#el.delete(node);
      this.#nodeKey.delete(node);
      set!.delete(node);
      // a detail row closed while its row stays: the row is shorter now. If the whole row scrolled
      // away, keep its last height (it will most likely be the same when it's back).
      queueMicrotask(() => {
        if (set!.size) { this.#remember(key); this.#version++; }
        else if (this.#live.get(key) === set) this.#live.delete(key);
      });
    };
  };

  /** Scroll the page so row i is on screen, so it is rendered (e.g. to move focus to it). */
  scrollToIndex(i: number) {
    if (!this.body || i < 0) return;
    if (i >= this.loaded) { this.loaded = i + 1; this.#update(); }
    const listTop = this.body.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: listTop + (this.#offsets[i] ?? 0) - window.innerHeight / 3, behavior: "instant" });
    this.#update();
  }

  /** Scroll back to the top of the list if the page is scrolled past it (after a new search or sort). */
  toTop() {
    if (!this.body) return;
    const header = document.querySelector<HTMLElement>("header.site")?.offsetHeight ?? 0;
    const table = this.body.closest(".table-wrap") ?? this.body;
    const top = table.getBoundingClientRect().top;
    if (top < header) window.scrollBy(0, top - header - 12);
  }
}

/** index of the first value greater than x in a sorted array */
function upperBound(a: number[], x: number): number {
  let lo = 0, hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
