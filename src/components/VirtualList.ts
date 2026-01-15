import type { Entry } from '../types';
import { formatTime, formatBib, getPointColor, escapeHtml, debounce } from '../utils';
import { store } from '../store';

// Virtual list configuration
const ITEM_HEIGHT = 72; // Height of each result item in pixels
const BUFFER_SIZE = 5; // Number of items to render above/below viewport
const SCROLL_DEBOUNCE = 16; // ~60fps

interface VirtualListOptions {
  container: HTMLElement;
  onItemClick?: (entry: Entry, event: MouseEvent) => void;
  onItemDelete?: (entry: Entry) => void;
  onItemSelect?: (entry: Entry, selected: boolean) => void;
}

export class VirtualList {
  private container: HTMLElement;
  private scrollContainer: HTMLElement;
  private contentContainer: HTMLElement;
  private entries: Entry[] = [];
  private filteredEntries: Entry[] = [];
  private visibleItems: Map<string, HTMLElement> = new Map();
  private scrollTop = 0;
  private containerHeight = 0;
  private options: VirtualListOptions;
  private unsubscribe: (() => void) | null = null;

  constructor(options: VirtualListOptions) {
    this.options = options;
    this.container = options.container;

    // Create scroll container
    this.scrollContainer = document.createElement('div');
    this.scrollContainer.className = 'virtual-scroll-container';
    this.scrollContainer.style.cssText = `
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
    `;

    // Create content container for height
    this.contentContainer = document.createElement('div');
    this.contentContainer.className = 'virtual-scroll-content';
    this.contentContainer.style.position = 'relative';

    this.scrollContainer.appendChild(this.contentContainer);
    this.container.appendChild(this.scrollContainer);

    // Set up scroll listener with debounce
    const handleScroll = debounce(() => this.onScroll(), SCROLL_DEBOUNCE);
    this.scrollContainer.addEventListener('scroll', handleScroll, { passive: true });

    // Set up resize observer
    const resizeObserver = new ResizeObserver(() => {
      this.containerHeight = this.scrollContainer.clientHeight;
      this.render();
    });
    resizeObserver.observe(this.scrollContainer);

    // Subscribe to store updates
    this.unsubscribe = store.subscribe((state, changedKeys) => {
      if (changedKeys.includes('entries') || changedKeys.includes('selectedEntries')) {
        this.setEntries(state.entries);
      }
    });

    // Initial setup
    this.containerHeight = this.scrollContainer.clientHeight;
  }

  /**
   * Set entries to display
   */
  setEntries(entries: Entry[]): void {
    this.entries = entries;
    this.applyFilters();
  }

  /**
   * Apply current filters
   */
  applyFilters(searchTerm?: string, pointFilter?: string, statusFilter?: string): void {
    let filtered = [...this.entries];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(e =>
        e.bib.toLowerCase().includes(term) ||
        e.deviceName?.toLowerCase().includes(term)
      );
    }

    if (pointFilter && pointFilter !== 'all') {
      filtered = filtered.filter(e => e.point === pointFilter);
    }

    if (statusFilter && statusFilter !== 'all') {
      filtered = filtered.filter(e => e.status === statusFilter);
    }

    // Sort by timestamp descending (newest first)
    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    this.filteredEntries = filtered;
    this.updateContentHeight();
    this.render();
  }

  /**
   * Update content container height
   */
  private updateContentHeight(): void {
    const totalHeight = this.filteredEntries.length * ITEM_HEIGHT;
    this.contentContainer.style.height = `${totalHeight}px`;
  }

  /**
   * Handle scroll event
   */
  private onScroll(): void {
    this.scrollTop = this.scrollContainer.scrollTop;
    this.render();
  }

  /**
   * Render visible items
   */
  render(): void {
    if (this.filteredEntries.length === 0) {
      this.renderEmpty();
      return;
    }

    // Calculate visible range
    const startIndex = Math.max(0, Math.floor(this.scrollTop / ITEM_HEIGHT) - BUFFER_SIZE);
    const endIndex = Math.min(
      this.filteredEntries.length,
      Math.ceil((this.scrollTop + this.containerHeight) / ITEM_HEIGHT) + BUFFER_SIZE
    );

    const state = store.getState();
    const visibleIds = new Set<string>();

    // Render visible items
    for (let i = startIndex; i < endIndex; i++) {
      const entry = this.filteredEntries[i];
      visibleIds.add(entry.id);

      let item = this.visibleItems.get(entry.id);
      const isSelected = state.selectedEntries.has(entry.id);

      if (!item) {
        item = this.createItem(entry);
        this.visibleItems.set(entry.id, item);
        this.contentContainer.appendChild(item);
      }

      // Update position
      item.style.transform = `translateY(${i * ITEM_HEIGHT}px)`;

      // Update selection state
      item.classList.toggle('selected', isSelected);
      const checkbox = item.querySelector('.result-checkbox') as HTMLInputElement;
      if (checkbox) {
        checkbox.checked = isSelected;
      }
    }

    // Remove items no longer visible
    for (const [id, item] of this.visibleItems) {
      if (!visibleIds.has(id)) {
        item.remove();
        this.visibleItems.delete(id);
      }
    }
  }

  /**
   * Create a list item element
   */
  private createItem(entry: Entry): HTMLElement {
    const item = document.createElement('div');
    item.className = 'result-item';
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-entry-id', entry.id);
    item.style.cssText = `
      position: absolute;
      left: 0;
      right: 0;
      height: ${ITEM_HEIGHT}px;
      display: flex;
      align-items: center;
      padding: 0 16px;
      gap: 12px;
      background: var(--surface);
      border-bottom: 1px solid var(--surface-elevated);
      cursor: pointer;
      transition: background 0.2s;
    `;

    const date = new Date(entry.timestamp);
    const timeStr = formatTime(date);
    const bibStr = formatBib(entry.bib || '---');
    const pointColor = getPointColor(entry.point);

    item.innerHTML = `
      <input type="checkbox" class="result-checkbox" aria-label="Select entry"
        style="width: 20px; height: 20px; accent-color: var(--primary);">
      <div class="result-bib" style="font-family: 'JetBrains Mono', monospace; font-size: 1.25rem; font-weight: 600; min-width: 50px;">
        ${escapeHtml(bibStr)}
      </div>
      <div class="result-point" style="padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; background: ${pointColor}20; color: ${pointColor};">
        ${escapeHtml(entry.point)}
      </div>
      <div class="result-time" style="flex: 1; font-family: 'JetBrains Mono', monospace; color: var(--text-secondary);">
        ${escapeHtml(timeStr)}
      </div>
      ${entry.status !== 'ok' ? `
        <span class="result-status" style="padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; background: var(--error); color: white;">
          ${escapeHtml(entry.status.toUpperCase())}
        </span>
      ` : ''}
      ${entry.photo ? `
        <span class="result-photo-indicator" style="color: var(--primary);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z"/>
            <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
          </svg>
        </span>
      ` : ''}
      <button class="result-delete" aria-label="Delete entry" style="background: none; border: none; color: var(--error); padding: 8px; cursor: pointer; opacity: 0.7;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    `;

    // Event listeners
    const checkbox = item.querySelector('.result-checkbox') as HTMLInputElement;
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      this.options.onItemSelect?.(entry, checkbox.checked);
    });

    const deleteBtn = item.querySelector('.result-delete') as HTMLButtonElement;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.options.onItemDelete?.(entry);
    });

    item.addEventListener('click', (e) => {
      this.options.onItemClick?.(entry, e);
    });

    // Touch feedback
    item.addEventListener('touchstart', () => {
      item.style.background = 'var(--surface-elevated)';
    }, { passive: true });

    item.addEventListener('touchend', () => {
      item.style.background = 'var(--surface)';
    }, { passive: true });

    return item;
  }

  /**
   * Render empty state
   */
  private renderEmpty(): void {
    // Clear existing items
    for (const item of this.visibleItems.values()) {
      item.remove();
    }
    this.visibleItems.clear();

    this.contentContainer.innerHTML = `
      <div class="empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 200px; color: var(--text-secondary);">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 16px; opacity: 0.5;">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        </svg>
        <span id="empty-state-text">No entries recorded</span>
      </div>
    `;
  }

  /**
   * Scroll to top
   */
  scrollToTop(): void {
    this.scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Scroll to entry
   */
  scrollToEntry(entryId: string): void {
    const index = this.filteredEntries.findIndex(e => e.id === entryId);
    if (index !== -1) {
      const top = index * ITEM_HEIGHT;
      this.scrollContainer.scrollTo({ top, behavior: 'smooth' });
    }
  }

  /**
   * Get visible count
   */
  getVisibleCount(): number {
    return this.filteredEntries.length;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.visibleItems.clear();
    this.container.innerHTML = '';
  }
}
