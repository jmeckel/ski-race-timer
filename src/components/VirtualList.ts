import type { Entry, FaultEntry, Run } from '../types';
import { formatTime, formatBib, getPointColor, getPointLabel, getRunColor, getRunLabel, escapeHtml, escapeAttr } from '../utils';
import { store } from '../store';
import { t } from '../i18n/translations';
import { logger } from '../utils/logger';

// Group of items for the same bib+run
interface DisplayGroup {
  id: string;           // bib-run
  bib: string;
  run: Run;
  entries: Entry[];     // Timing entries (Start, Finish)
  faults: FaultEntry[]; // Fault entries
  isMultiItem: boolean; // Has more than 1 item total
  latestTimestamp: string;
}

// Virtual list configuration
const ITEM_HEIGHT = 72; // Height of each result item in pixels
const SUB_ITEM_HEIGHT = 56; // Height of sub-items when expanded
const GROUP_HEADER_HEIGHT = 72; // Height of group header
const BUFFER_SIZE = 5; // Number of items to render above/below viewport
const SCROLL_DEBOUNCE = 16; // ~60fps
const RESIZE_DEBOUNCE = 100; // Debounce resize events for battery efficiency

interface VirtualListOptions {
  container: HTMLElement;
  onItemClick?: (entry: Entry, event: MouseEvent) => void;
  onItemDelete?: (entry: Entry) => void;
  onItemSelect?: (entry: Entry, selected: boolean) => void;
  onViewPhoto?: (entry: Entry) => void;
}

// Track listeners for cleanup
interface ItemListeners {
  click?: EventListener;
  keydown?: EventListener;
  touchstart?: EventListener;
  touchend?: EventListener;
  // Child button listeners
  editClick?: EventListener;
  deleteClick?: EventListener;
  photoClick?: EventListener;
  // References to child elements for cleanup
  editBtn?: HTMLElement;
  deleteBtn?: HTMLElement;
  photoBtn?: HTMLElement;
}

export class VirtualList {
  private container: HTMLElement;
  private scrollContainer: HTMLElement;
  private contentContainer: HTMLElement;
  private entries: Entry[] = [];
  private groups: DisplayGroup[] = [];
  private expandedGroups: Set<string> = new Set();
  private visibleItems: Map<string, HTMLElement> = new Map();
  private itemListeners: Map<string, ItemListeners> = new Map(); // Track listeners per item
  private scrollTop = 0;
  private containerHeight = 0;
  private options: VirtualListOptions;
  private unsubscribe: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private scrollHandler: (() => void) | null = null;
  private scrollDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
  private resizeDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
  private isPaused = false;
  private needsRefreshOnResume = false;
  private isDestroyed = false;
  private domRemovalObserver: MutationObserver | null = null;

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

    // Set up scroll listener with cancellable debounce
    this.scrollHandler = () => {
      if (this.scrollDebounceTimeout !== null) {
        clearTimeout(this.scrollDebounceTimeout);
      }
      this.scrollDebounceTimeout = setTimeout(() => {
        this.scrollDebounceTimeout = null;
        try {
          this.onScroll();
        } catch (error) {
          logger.error('VirtualList scroll error:', error);
        }
      }, SCROLL_DEBOUNCE);
    };
    this.scrollContainer.addEventListener('scroll', this.scrollHandler, { passive: true });

    // Set up resize observer with debounce for battery efficiency
    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeDebounceTimeout !== null) {
        clearTimeout(this.resizeDebounceTimeout);
      }
      this.resizeDebounceTimeout = setTimeout(() => {
        this.resizeDebounceTimeout = null;
        try {
          this.containerHeight = this.scrollContainer.clientHeight;
          // Respect pause state to avoid background rendering
          if (this.isPaused) {
            this.needsRefreshOnResume = true;
          } else {
            this.render();
          }
        } catch (error) {
          logger.error('VirtualList resize error:', error);
        }
      }, RESIZE_DEBOUNCE);
    });
    this.resizeObserver.observe(this.scrollContainer);

    // Subscribe to store updates
    this.unsubscribe = store.subscribe((stateSnapshot, changedKeys) => {
      if (changedKeys.includes('entries') || changedKeys.includes('selectedEntries') || changedKeys.includes('faultEntries')) {
        this.setEntries(stateSnapshot.entries);
      }
    });

    // Watch for container removal from DOM to auto-cleanup (prevents memory leak)
    this.domRemovalObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const removedNode of mutation.removedNodes) {
          if (removedNode === this.container || removedNode.contains?.(this.container)) {
            this.destroy();
            return;
          }
        }
      }
    });
    // Observe the parent of the container (or body as fallback)
    const observeTarget = this.container.parentElement || document.body;
    this.domRemovalObserver.observe(observeTarget, { childList: true, subtree: true });

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
   * Apply current filters and group items
   */
  applyFilters(searchTerm?: string, pointFilter?: string, statusFilter?: string): void {
    // Cancel any pending scroll-triggered render to prevent double-render
    if (this.scrollDebounceTimeout !== null) {
      clearTimeout(this.scrollDebounceTimeout);
      this.scrollDebounceTimeout = null;
    }

    const state = store.getState();
    let filteredEntries = [...this.entries];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filteredEntries = filteredEntries.filter(e =>
        e.bib.toLowerCase().includes(term) ||
        e.deviceName?.toLowerCase().includes(term)
      );
    }

    if (pointFilter && pointFilter !== 'all') {
      filteredEntries = filteredEntries.filter(e => e.point === pointFilter);
    }

    if (statusFilter && statusFilter !== 'all') {
      filteredEntries = filteredEntries.filter(e => e.status === statusFilter);
    }

    // Group entries by bib+run
    const groupMap = new Map<string, DisplayGroup>();

    // Add timing entries to groups
    for (const entry of filteredEntries) {
      const run = entry.run ?? 1;
      const key = `${entry.bib}-${run}`;

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          id: key,
          bib: entry.bib,
          run,
          entries: [],
          faults: [],
          isMultiItem: false,
          latestTimestamp: entry.timestamp
        });
      }

      const group = groupMap.get(key)!;
      group.entries.push(entry);
      if (new Date(entry.timestamp) > new Date(group.latestTimestamp)) {
        group.latestTimestamp = entry.timestamp;
      }
    }

    // Add faults to groups
    for (const fault of state.faultEntries) {
      const key = `${fault.bib}-${fault.run}`;

      // Apply search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (!fault.bib.toLowerCase().includes(term) &&
            !fault.deviceName?.toLowerCase().includes(term)) {
          continue;
        }
      }

      // Skip faults if point filter is set (faults don't have S/F)
      if (pointFilter && pointFilter !== 'all') {
        continue;
      }

      // For status filter, include faults when filtering for dsq/flt or all
      if (statusFilter && statusFilter !== 'all' && statusFilter !== 'dsq' && statusFilter !== 'flt') {
        continue;
      }

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          id: key,
          bib: fault.bib,
          run: fault.run,
          entries: [],
          faults: [],
          isMultiItem: false,
          latestTimestamp: fault.timestamp
        });
      }

      const group = groupMap.get(key)!;
      group.faults.push(fault);
      if (new Date(fault.timestamp) > new Date(group.latestTimestamp)) {
        group.latestTimestamp = fault.timestamp;
      }
    }

    // Calculate isMultiItem for each group
    for (const group of groupMap.values()) {
      const totalItems = group.entries.length + group.faults.length;
      group.isMultiItem = totalItems > 1;
    }

    // Sort groups by bib number descending
    this.groups = Array.from(groupMap.values()).sort((a, b) => {
      const bibA = parseInt(a.bib, 10) || 0;
      const bibB = parseInt(b.bib, 10) || 0;
      return bibB - bibA;
    });

    // Clear visible items cache when data changes
    for (const [id, item] of this.visibleItems) {
      this.cleanupItemListeners(id, item);
      item.remove();
    }
    this.visibleItems.clear();

    this.updateContentHeight();

    // Respect pause state to avoid background rendering
    if (this.isPaused) {
      this.needsRefreshOnResume = true;
    } else {
      this.render();
    }
  }

  /**
   * Toggle group expansion
   */
  toggleGroup(groupId: string): void {
    if (this.expandedGroups.has(groupId)) {
      this.expandedGroups.delete(groupId);
    } else {
      this.expandedGroups.add(groupId);
    }

    // Clear cache and re-render
    for (const [id, item] of this.visibleItems) {
      this.cleanupItemListeners(id, item);
      item.remove();
    }
    this.visibleItems.clear();

    this.updateContentHeight();

    // Respect pause state
    if (this.isPaused) {
      this.needsRefreshOnResume = true;
    } else {
      this.render();
    }
  }

  /**
   * Calculate total content height
   */
  private updateContentHeight(): void {
    let totalHeight = 0;

    for (const group of this.groups) {
      if (!group.isMultiItem) {
        // Single item - fixed height
        totalHeight += ITEM_HEIGHT;
      } else if (this.expandedGroups.has(group.id)) {
        // Expanded group - header + sub-items
        const subItemCount = group.entries.length + group.faults.length;
        totalHeight += GROUP_HEADER_HEIGHT + (subItemCount * SUB_ITEM_HEIGHT);
      } else {
        // Collapsed group - just header
        totalHeight += GROUP_HEADER_HEIGHT;
      }
    }

    this.contentContainer.style.height = `${totalHeight}px`;
  }

  /**
   * Get the Y position for a group by index
   */
  private getGroupPosition(index: number): number {
    let position = 0;

    for (let i = 0; i < index && i < this.groups.length; i++) {
      position += this.getGroupHeight(this.groups[i]);
    }

    return position;
  }

  /**
   * Get height of a group
   */
  private getGroupHeight(group: DisplayGroup): number {
    if (!group.isMultiItem) {
      return ITEM_HEIGHT;
    }
    if (this.expandedGroups.has(group.id)) {
      const subItemCount = group.entries.length + group.faults.length;
      return GROUP_HEADER_HEIGHT + (subItemCount * SUB_ITEM_HEIGHT);
    }
    return GROUP_HEADER_HEIGHT;
  }

  /**
   * Handle scroll event
   */
  private onScroll(): void {
    this.scrollTop = this.scrollContainer.scrollTop;
    // Respect pause state to avoid background rendering
    if (this.isPaused) {
      this.needsRefreshOnResume = true;
    } else {
      this.render();
    }
  }

  /**
   * Render visible items
   */
  render(): void {
    if (this.groups.length === 0) {
      this.renderEmpty();
      return;
    }

    // Remove empty state if present
    const emptyState = this.contentContainer.querySelector('.empty-state');
    if (emptyState) {
      emptyState.remove();
    }

    const state = store.getState();
    const visibleIds = new Set<string>();
    const viewportTop = this.scrollTop;
    const viewportBottom = this.scrollTop + this.containerHeight;

    // Render visible groups
    let currentY = 0;

    for (let i = 0; i < this.groups.length; i++) {
      const group = this.groups[i];
      const groupHeight = this.getGroupHeight(group);
      const groupBottom = currentY + groupHeight;

      // Check if group is in viewport (with buffer)
      const inViewport = groupBottom >= viewportTop - (BUFFER_SIZE * ITEM_HEIGHT) &&
                        currentY <= viewportBottom + (BUFFER_SIZE * ITEM_HEIGHT);

      if (inViewport) {
        if (!group.isMultiItem) {
          // Single item - render as flat
          this.renderSingleItem(group, currentY, visibleIds);
        } else if (this.expandedGroups.has(group.id)) {
          // Expanded group - render header + sub-items
          this.renderExpandedGroup(group, currentY, visibleIds);
        } else {
          // Collapsed group - render just header
          this.renderCollapsedGroup(group, currentY, visibleIds);
        }
      }

      currentY += groupHeight;
    }

    // Remove items no longer visible
    for (const [id, item] of this.visibleItems) {
      if (!visibleIds.has(id)) {
        this.cleanupItemListeners(id, item);
        item.remove();
        this.visibleItems.delete(id);
      }
    }
  }

  /**
   * Render a single-item group (flat format - current behavior)
   */
  private renderSingleItem(group: DisplayGroup, yPosition: number, visibleIds: Set<string>): void {
    const itemId = `single-${group.id}`;
    visibleIds.add(itemId);

    let item = this.visibleItems.get(itemId);

    if (!item) {
      if (group.entries.length > 0) {
        item = this.createEntryItem(group.entries[0], group.faults, itemId);
      } else if (group.faults.length > 0) {
        item = this.createFaultOnlyItem(group, itemId);
      } else {
        return;
      }
      this.visibleItems.set(itemId, item);
      this.contentContainer.appendChild(item);
    }

    item.style.transform = `translateY(${yPosition}px)`;
  }

  /**
   * Render a collapsed multi-item group (just header)
   */
  private renderCollapsedGroup(group: DisplayGroup, yPosition: number, visibleIds: Set<string>): void {
    const headerId = `header-${group.id}`;
    visibleIds.add(headerId);

    let header = this.visibleItems.get(headerId);

    if (!header) {
      header = this.createGroupHeader(group, false);
      this.visibleItems.set(headerId, header);
      this.contentContainer.appendChild(header);
    }

    header.style.transform = `translateY(${yPosition}px)`;
  }

  /**
   * Render an expanded multi-item group (header + sub-items)
   */
  private renderExpandedGroup(group: DisplayGroup, yPosition: number, visibleIds: Set<string>): void {
    // Render header
    const headerId = `header-${group.id}`;
    visibleIds.add(headerId);

    let header = this.visibleItems.get(headerId);

    if (!header) {
      header = this.createGroupHeader(group, true);
      this.visibleItems.set(headerId, header);
      this.contentContainer.appendChild(header);
    }

    header.style.transform = `translateY(${yPosition}px)`;

    // Render sub-items
    let subY = yPosition + GROUP_HEADER_HEIGHT;

    // Render timing entries
    for (let i = 0; i < group.entries.length; i++) {
      const entry = group.entries[i];
      const subId = `sub-entry-${entry.id}`;
      visibleIds.add(subId);

      let subItem = this.visibleItems.get(subId);

      if (!subItem) {
        subItem = this.createSubEntryItem(entry, subId);
        this.visibleItems.set(subId, subItem);
        this.contentContainer.appendChild(subItem);
      }

      subItem.style.transform = `translateY(${subY}px)`;
      subY += SUB_ITEM_HEIGHT;
    }

    // Render faults
    for (let i = 0; i < group.faults.length; i++) {
      const fault = group.faults[i];
      const subId = `sub-fault-${fault.id}`;
      visibleIds.add(subId);

      let subItem = this.visibleItems.get(subId);

      if (!subItem) {
        subItem = this.createSubFaultItem(fault, subId);
        this.visibleItems.set(subId, subItem);
        this.contentContainer.appendChild(subItem);
      }

      subItem.style.transform = `translateY(${subY}px)`;
      subY += SUB_ITEM_HEIGHT;
    }
  }

  /**
   * Create group header element
   */
  private createGroupHeader(group: DisplayGroup, isExpanded: boolean): HTMLElement {
    const header = document.createElement('div');
    header.className = `result-group-header ${isExpanded ? 'expanded' : ''}`;
    header.setAttribute('data-group-id', group.id);
    // ARIA attributes for accessibility
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-expanded', String(isExpanded));
    header.style.cssText = `
      position: absolute;
      left: 0;
      right: 0;
      height: ${GROUP_HEADER_HEIGHT}px;
      display: flex;
      align-items: center;
      padding: 0 8px 0 4px;
      gap: 8px;
      background: var(--surface);
      border-bottom: 1px solid var(--surface-elevated);
      cursor: pointer;
      transition: background 0.2s;
    `;

    const bibStr = formatBib(group.bib || '---');
    const state = store.getState();
    const lang = state.currentLang;
    const runColor = getRunColor(group.run);
    const runLabel = getRunLabel(group.run, lang);

    const entryCount = group.entries.length;
    const faultCount = group.faults.length;
    const hasFaults = faultCount > 0;

    // Summary text (localized)
    const summaryParts: string[] = [];
    if (entryCount > 0) {
      summaryParts.push(`${entryCount} ${t(entryCount === 1 ? 'timeEntry' : 'timeEntries', lang)}`);
    }
    if (faultCount > 0) {
      summaryParts.push(`${faultCount} ${t(faultCount === 1 ? 'faultEntry' : 'faultEntries', lang)}`);
    }
    const summaryText = summaryParts.join(', ');

    // Chevron icon
    const chevronSvg = `
      <svg class="group-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true" style="flex-shrink: 0; transition: transform 0.2s; ${isExpanded ? 'transform: rotate(90deg);' : ''}">
        <path d="M9 18l6-6-6-6"/>
      </svg>
    `;

    header.innerHTML = `
      ${chevronSvg}
      <div class="result-bib" style="font-family: 'JetBrains Mono', monospace; font-size: 1.25rem; font-weight: 600; min-width: 44px; text-align: right;">
        ${escapeHtml(bibStr)}
      </div>
      <div style="min-width: 48px;"></div>
      <span class="result-run" data-advanced style="padding: 4px 6px; border-radius: var(--radius); font-size: 0.75rem; font-weight: 600; min-width: 36px; text-align: center; background: ${runColor}20; color: ${runColor};">${escapeHtml(runLabel)}</span>
      <div class="result-info" style="flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0;">
        <div class="result-summary" style="font-size: 0.875rem; color: var(--text-secondary);">
          ${escapeHtml(summaryText)}
        </div>
      </div>
      ${hasFaults ? `
        <span class="result-fault-badge" style="padding: 2px 6px; border-radius: var(--radius); font-size: 0.7rem; font-weight: 600; background: var(--warning); color: #000;">
          ${faultCount}× FLT
        </span>
      ` : ''}
    `;

    // Create and track event listeners for cleanup
    const headerId = `header-${group.id}`;
    const listeners: ItemListeners = {};

    // Click to toggle
    listeners.click = () => {
      this.toggleGroup(group.id);
    };
    header.addEventListener('click', listeners.click);

    // Keyboard support for accessibility
    listeners.keydown = ((e: KeyboardEvent) => {
      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          this.toggleGroup(group.id);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.focusNextItem(header);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.focusPreviousItem(header);
          break;
      }
    }) as EventListener;
    header.addEventListener('keydown', listeners.keydown);

    // Touch feedback
    listeners.touchstart = () => {
      header.style.background = 'var(--surface-elevated)';
    };
    header.addEventListener('touchstart', listeners.touchstart, { passive: true });

    listeners.touchend = () => {
      header.style.background = 'var(--surface)';
    };
    header.addEventListener('touchend', listeners.touchend, { passive: true });

    // Store listeners for cleanup
    this.itemListeners.set(headerId, listeners);

    return header;
  }

  /**
   * Create a timing entry item (for single-item groups)
   */
  private createEntryItem(entry: Entry, faults: FaultEntry[], itemId: string): HTMLElement {
    const item = document.createElement('div');
    item.className = 'result-item';
    item.setAttribute('role', 'listitem');
    item.setAttribute('tabindex', '0');
    item.setAttribute('data-entry-id', entry.id);
    item.style.cssText = `
      position: absolute;
      left: 0;
      right: 0;
      height: ${ITEM_HEIGHT}px;
      display: flex;
      align-items: center;
      padding: 0 8px 0 4px;
      gap: 8px;
      background: var(--surface);
      border-bottom: 1px solid var(--surface-elevated);
      cursor: pointer;
      transition: background 0.2s;
    `;

    const date = new Date(entry.timestamp);
    const timeStr = formatTime(date);
    const bibStr = formatBib(entry.bib || '---');
    const state = store.getState();
    const lang = state.currentLang;
    const pointColor = getPointColor(entry.point);
    const pointLabel = getPointLabel(entry.point, lang);
    const run = entry.run ?? 1;
    const runColor = getRunColor(run);
    const runLabel = getRunLabel(run, lang);

    const hasFaults = faults.length > 0;
    const faultBadgeHtml = hasFaults ? `
      <span class="result-fault-badge" title="${escapeAttr(faults.map(f => `T${f.gateNumber} (${f.faultType})`).join(', '))}" style="padding: 2px 6px; border-radius: var(--radius); font-size: 0.7rem; font-weight: 600; background: var(--warning); color: #000;">
        ${faults.length > 1 ? `${faults.length}× FLT` : `T${faults[0]?.gateNumber || '?'}`}
      </span>
    ` : '';

    item.innerHTML = `
      <div style="width: 16px; flex-shrink: 0;"></div>
      <div class="result-bib" style="font-family: 'JetBrains Mono', monospace; font-size: 1.25rem; font-weight: 600; min-width: 44px; text-align: right;">
        ${escapeHtml(bibStr)}
      </div>
      <div class="result-point" style="padding: 4px 6px; border-radius: var(--radius); font-size: 0.75rem; font-weight: 600; min-width: 48px; text-align: center; background: ${pointColor}20; color: ${pointColor};">
        ${escapeHtml(pointLabel)}
      </div>
      <span class="result-run" data-advanced style="padding: 4px 6px; border-radius: var(--radius); font-size: 0.75rem; font-weight: 600; min-width: 36px; text-align: center; background: ${runColor}20; color: ${runColor};">${escapeHtml(runLabel)}</span>
      <div class="result-info" style="flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0;">
        <div class="result-time" style="font-family: 'JetBrains Mono', monospace; color: var(--text-secondary); font-size: 0.875rem;">
          ${escapeHtml(timeStr)}
        </div>
        ${entry.deviceName ? `
          <div class="result-device" style="font-size: 0.7rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(entry.deviceName)}
          </div>
        ` : ''}
      </div>
      ${faultBadgeHtml}
      ${entry.status !== 'ok' ? `
        <span class="result-status" style="padding: 2px 6px; border-radius: var(--radius); font-size: 0.7rem; font-weight: 600; background: var(--error); color: white;">
          ${escapeHtml(entry.status.toUpperCase())}
        </span>
      ` : ''}
      ${entry.photo ? `
        <button class="result-photo-btn" aria-label="${t('viewPhotoLabel', lang)}" style="background: none; border: none; color: var(--primary); padding: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z"/>
            <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
          </svg>
        </button>
      ` : ''}
      <button class="result-edit-btn" aria-label="${t('editEntryLabel', lang)}" style="background: none; border: none; color: var(--primary); padding: 6px; cursor: pointer; opacity: 0.7;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="result-delete" aria-label="${t('deleteEntryLabel', lang)}" style="background: none; border: none; color: var(--error); padding: 6px; cursor: pointer; opacity: 0.7;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    `;

    // Track all event listeners for cleanup
    const listeners: ItemListeners = {};

    // Edit button
    const editBtn = item.querySelector('.result-edit-btn') as HTMLButtonElement;
    listeners.editBtn = editBtn;
    listeners.editClick = ((e: Event) => {
      e.stopPropagation();
      this.options.onItemClick?.(entry, e as MouseEvent);
    }) as EventListener;
    editBtn.addEventListener('click', listeners.editClick);

    // Delete button
    const deleteBtn = item.querySelector('.result-delete') as HTMLButtonElement;
    listeners.deleteBtn = deleteBtn;
    listeners.deleteClick = ((e: Event) => {
      e.stopPropagation();
      this.options.onItemDelete?.(entry);
    }) as EventListener;
    deleteBtn.addEventListener('click', listeners.deleteClick);

    // Photo button (optional)
    const photoBtn = item.querySelector('.result-photo-btn') as HTMLButtonElement | null;
    if (photoBtn) {
      listeners.photoBtn = photoBtn;
      listeners.photoClick = ((e: Event) => {
        e.stopPropagation();
        this.options.onViewPhoto?.(entry);
      }) as EventListener;
      photoBtn.addEventListener('click', listeners.photoClick);
    }

    // Main item click
    listeners.click = ((e: Event) => {
      this.options.onItemClick?.(entry, e as MouseEvent);
    }) as EventListener;
    item.addEventListener('click', listeners.click);

    // Touch feedback
    listeners.touchstart = (() => {
      item.style.background = 'var(--surface-elevated)';
    }) as EventListener;
    item.addEventListener('touchstart', listeners.touchstart, { passive: true });

    listeners.touchend = (() => {
      item.style.background = 'var(--surface)';
    }) as EventListener;
    item.addEventListener('touchend', listeners.touchend, { passive: true });

    // Keyboard support: Enter/Space to open, E to edit, Delete to delete
    listeners.keydown = ((e: Event) => {
      const ke = e as KeyboardEvent;
      switch (ke.key) {
        case 'Enter':
        case ' ':
          ke.preventDefault();
          this.options.onItemClick?.(entry, new MouseEvent('click'));
          break;
        case 'e':
        case 'E':
          ke.preventDefault();
          this.options.onItemClick?.(entry, new MouseEvent('click'));
          break;
        case 'Delete':
        case 'd':
        case 'D':
          ke.preventDefault();
          this.options.onItemDelete?.(entry);
          break;
        case 'ArrowDown':
          ke.preventDefault();
          this.focusNextItem(item);
          break;
        case 'ArrowUp':
          ke.preventDefault();
          this.focusPreviousItem(item);
          break;
      }
    }) as EventListener;
    item.addEventListener('keydown', listeners.keydown);

    // Store listeners for cleanup
    this.itemListeners.set(itemId, listeners);

    return item;
  }

  /**
   * Create a fault-only item (for single-item groups with only faults)
   */
  private createFaultOnlyItem(group: DisplayGroup, itemId: string): HTMLElement {
    const item = document.createElement('div');
    const faults = group.faults;
    const hasMarkedForDeletion = faults.some(f => f.markedForDeletion);

    item.className = `result-item fault-only-item${hasMarkedForDeletion ? ' marked-for-deletion' : ''}`;
    item.setAttribute('role', 'listitem');
    item.setAttribute('tabindex', '0');
    item.setAttribute('data-fault-id', group.id);
    item.style.cssText = `
      position: absolute;
      left: 0;
      right: 0;
      height: ${ITEM_HEIGHT}px;
      display: flex;
      align-items: center;
      padding: 0 8px 0 4px;
      gap: 8px;
      background: var(--surface);
      border-bottom: 1px solid var(--surface-elevated);
      border-left: 3px solid ${hasMarkedForDeletion ? 'var(--error)' : 'var(--warning)'};
      ${hasMarkedForDeletion ? 'opacity: 0.6;' : ''}
      cursor: pointer;
    `;

    const bibStr = formatBib(group.bib || '---');
    const state = store.getState();
    const lang = state.currentLang;
    const runColor = getRunColor(group.run);
    const runLabel = getRunLabel(group.run, lang);

    const faultDetails = faults
      .sort((a, b) => a.gateNumber - b.gateNumber)
      .map(f => `T${f.gateNumber} (${f.faultType})${f.markedForDeletion ? ' ⚠' : ''}`)
      .join(', ');

    const faultBadgeHtml = `
      <span class="result-fault-badge" title="${escapeAttr(faultDetails)}" style="padding: 2px 6px; border-radius: var(--radius); font-size: 0.7rem; font-weight: 600; background: var(--warning); color: #000;">
        ${faults.length > 1 ? `${faults.length}× FLT` : `T${faults[0]?.gateNumber || '?'}`}
      </span>
    `;

    const statusLabel = state.usePenaltyMode ? t('flt', lang) : 'DSQ';
    const statusColor = state.usePenaltyMode ? 'var(--warning)' : 'var(--error)';

    const deletionPendingBadge = hasMarkedForDeletion ? `
      <span class="deletion-pending-status" style="display: flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: var(--radius); font-size: 0.7rem; font-weight: 600; background: var(--error); color: white;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 9v4M12 17h.01"/>
          <circle cx="12" cy="12" r="10"/>
        </svg>
        DEL
      </span>
    ` : '';

    item.innerHTML = `
      <div style="width: 16px; flex-shrink: 0;"></div>
      <div class="result-bib" style="font-family: 'JetBrains Mono', monospace; font-size: 1.25rem; font-weight: 600; min-width: 44px; text-align: right; ${hasMarkedForDeletion ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
        ${escapeHtml(bibStr)}
      </div>
      <div class="result-point" style="padding: 4px 6px; border-radius: var(--radius); font-size: 0.75rem; font-weight: 600; min-width: 48px; text-align: center; background: var(--warning)20; color: var(--warning);">
        ${t('gate', lang)}
      </div>
      <span class="result-run" data-advanced style="padding: 4px 6px; border-radius: var(--radius); font-size: 0.75rem; font-weight: 600; min-width: 36px; text-align: center; background: ${runColor}20; color: ${runColor};">${escapeHtml(runLabel)}</span>
      <div class="result-info" style="flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0;">
        <div class="result-fault-details" style="font-size: 0.8rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; ${hasMarkedForDeletion ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
          ${escapeHtml(faultDetails)}
        </div>
        ${faults[0]?.deviceName ? `
          <div class="result-device" style="font-size: 0.7rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(faults[0].deviceName)}
          </div>
        ` : ''}
      </div>
      ${deletionPendingBadge}
      ${!hasMarkedForDeletion ? faultBadgeHtml : ''}
      ${!hasMarkedForDeletion ? `
        <span class="result-status" style="padding: 2px 6px; border-radius: var(--radius); font-size: 0.7rem; font-weight: 600; background: ${statusColor}; color: ${statusColor === 'var(--warning)' ? '#000' : 'white'};">
          ${escapeHtml(statusLabel)}
        </span>
      ` : ''}
      <button class="result-edit-btn" aria-label="${t('editFaultLabel', lang)}" style="background: none; border: none; color: var(--primary); padding: 6px; cursor: pointer; opacity: 0.7;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="result-delete fault-delete-btn" aria-label="${t('deleteFaultLabel', lang)}" style="background: none; border: none; color: var(--error); padding: 6px; cursor: pointer; opacity: 0.7;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    `;

    // Track all event listeners for cleanup
    const listeners: ItemListeners = {};

    // Edit button
    const editBtn = item.querySelector('.result-edit-btn') as HTMLButtonElement;
    if (editBtn && faults.length > 0) {
      listeners.editBtn = editBtn;
      listeners.editClick = ((e: Event) => {
        e.stopPropagation();
        const event = new CustomEvent('fault-edit-request', {
          bubbles: true,
          detail: { fault: faults[0] }
        });
        item.dispatchEvent(event);
      }) as EventListener;
      editBtn.addEventListener('click', listeners.editClick);
    }

    // Delete button
    const deleteBtn = item.querySelector('.fault-delete-btn') as HTMLButtonElement;
    if (deleteBtn && faults.length > 0) {
      listeners.deleteBtn = deleteBtn;
      listeners.deleteClick = ((e: Event) => {
        e.stopPropagation();
        const event = new CustomEvent('fault-delete-request', {
          bubbles: true,
          detail: { fault: faults[0] }
        });
        item.dispatchEvent(event);
      }) as EventListener;
      deleteBtn.addEventListener('click', listeners.deleteClick);
    }

    // Click opens edit modal for first fault
    listeners.click = ((e: Event) => {
      const target = e.target as HTMLElement;
      if (target.closest('.fault-delete-btn') || target.closest('.result-edit-btn')) return;

      if (faults.length > 0) {
        const event = new CustomEvent('fault-edit-request', {
          bubbles: true,
          detail: { fault: faults[0] }
        });
        item.dispatchEvent(event);
      }
    }) as EventListener;
    item.addEventListener('click', listeners.click);

    // Touch feedback
    listeners.touchstart = (() => {
      item.style.background = 'var(--surface-elevated)';
    }) as EventListener;
    item.addEventListener('touchstart', listeners.touchstart, { passive: true });

    listeners.touchend = (() => {
      item.style.background = 'var(--surface)';
    }) as EventListener;
    item.addEventListener('touchend', listeners.touchend, { passive: true });

    // Keyboard support: Enter/Space to edit, Delete to delete, arrow keys to navigate
    listeners.keydown = ((e: Event) => {
      const ke = e as KeyboardEvent;
      switch (ke.key) {
        case 'Enter':
        case ' ':
        case 'e':
        case 'E':
          ke.preventDefault();
          if (faults.length > 0) {
            const event = new CustomEvent('fault-edit-request', {
              bubbles: true,
              detail: { fault: faults[0] }
            });
            item.dispatchEvent(event);
          }
          break;
        case 'Delete':
        case 'd':
        case 'D':
          ke.preventDefault();
          if (faults.length > 0) {
            const event = new CustomEvent('fault-delete-request', {
              bubbles: true,
              detail: { fault: faults[0] }
            });
            item.dispatchEvent(event);
          }
          break;
        case 'ArrowDown':
          ke.preventDefault();
          this.focusNextItem(item);
          break;
        case 'ArrowUp':
          ke.preventDefault();
          this.focusPreviousItem(item);
          break;
      }
    }) as EventListener;
    item.addEventListener('keydown', listeners.keydown);

    // Store listeners for cleanup
    this.itemListeners.set(itemId, listeners);

    return item;
  }

  /**
   * Create a sub-item for timing entry (inside expanded group)
   */
  private createSubEntryItem(entry: Entry, itemId: string): HTMLElement {
    const item = document.createElement('div');
    item.className = 'result-sub-item entry-sub-item';
    item.setAttribute('role', 'listitem');
    item.setAttribute('tabindex', '0');
    item.setAttribute('data-entry-id', entry.id);
    item.style.cssText = `
      position: absolute;
      left: 0;
      right: 0;
      height: ${SUB_ITEM_HEIGHT}px;
      display: flex;
      align-items: center;
      padding: 0 8px 0 24px;
      gap: 8px;
      background: var(--surface-elevated);
      border-bottom: 1px solid var(--background);
      cursor: pointer;
      transition: background 0.2s;
    `;

    const date = new Date(entry.timestamp);
    const timeStr = formatTime(date);
    const state = store.getState();
    const lang = state.currentLang;
    const pointColor = getPointColor(entry.point);
    const pointLabel = getPointLabel(entry.point, lang);

    item.innerHTML = `
      <div style="width: 16px; flex-shrink: 0;"></div>
      <div style="min-width: 44px;"></div>
      <div class="result-point" style="padding: 4px 6px; border-radius: var(--radius); font-size: 0.7rem; font-weight: 600; min-width: 48px; text-align: center; background: ${pointColor}20; color: ${pointColor};">
        ${escapeHtml(pointLabel)}
      </div>
      <div style="min-width: 36px;"></div>
      <div class="result-info" style="flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0;">
        <div class="result-time" style="font-family: 'JetBrains Mono', monospace; color: var(--text-secondary); font-size: 0.85rem;">
          ${escapeHtml(timeStr)}
        </div>
        ${entry.deviceName ? `
          <div class="result-device" style="font-size: 0.65rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(entry.deviceName)}
          </div>
        ` : ''}
      </div>
      ${entry.status !== 'ok' ? `
        <span class="result-status" style="padding: 2px 6px; border-radius: var(--radius); font-size: 0.65rem; font-weight: 600; background: var(--error); color: white;">
          ${escapeHtml(entry.status.toUpperCase())}
        </span>
      ` : ''}
      <button class="result-edit-btn" aria-label="${t('editEntryLabel', lang)}" style="background: none; border: none; color: var(--primary); padding: 6px; cursor: pointer; opacity: 0.7;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="result-delete" aria-label="${t('deleteEntryLabel', lang)}" style="background: none; border: none; color: var(--error); padding: 6px; cursor: pointer; opacity: 0.7;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    `;

    // Track all event listeners for cleanup
    const listeners: ItemListeners = {};

    // Edit button
    const editBtn = item.querySelector('.result-edit-btn') as HTMLButtonElement;
    listeners.editBtn = editBtn;
    listeners.editClick = ((e: Event) => {
      e.stopPropagation();
      this.options.onItemClick?.(entry, e as MouseEvent);
    }) as EventListener;
    editBtn.addEventListener('click', listeners.editClick);

    // Delete button
    const deleteBtn = item.querySelector('.result-delete') as HTMLButtonElement;
    listeners.deleteBtn = deleteBtn;
    listeners.deleteClick = ((e: Event) => {
      e.stopPropagation();
      this.options.onItemDelete?.(entry);
    }) as EventListener;
    deleteBtn.addEventListener('click', listeners.deleteClick);

    // Click on row opens edit
    listeners.click = ((e: Event) => {
      this.options.onItemClick?.(entry, e as MouseEvent);
    }) as EventListener;
    item.addEventListener('click', listeners.click);

    // Touch feedback
    listeners.touchstart = (() => {
      item.style.background = 'var(--surface)';
    }) as EventListener;
    item.addEventListener('touchstart', listeners.touchstart, { passive: true });

    listeners.touchend = (() => {
      item.style.background = 'var(--surface-elevated)';
    }) as EventListener;
    item.addEventListener('touchend', listeners.touchend, { passive: true });

    // Keyboard support: Enter/Space to edit, Delete to delete, arrow keys to navigate
    listeners.keydown = ((e: Event) => {
      const ke = e as KeyboardEvent;
      switch (ke.key) {
        case 'Enter':
        case ' ':
        case 'e':
        case 'E':
          ke.preventDefault();
          this.options.onItemClick?.(entry, new MouseEvent('click'));
          break;
        case 'Delete':
        case 'd':
        case 'D':
          ke.preventDefault();
          this.options.onItemDelete?.(entry);
          break;
        case 'ArrowDown':
          ke.preventDefault();
          this.focusNextItem(item);
          break;
        case 'ArrowUp':
          ke.preventDefault();
          this.focusPreviousItem(item);
          break;
      }
    }) as EventListener;
    item.addEventListener('keydown', listeners.keydown);

    // Store listeners for cleanup
    this.itemListeners.set(itemId, listeners);

    return item;
  }

  /**
   * Create a sub-item for fault (inside expanded group)
   */
  private createSubFaultItem(fault: FaultEntry, itemId: string): HTMLElement {
    const item = document.createElement('div');
    const hasMarkedForDeletion = fault.markedForDeletion;

    item.className = `result-sub-item fault-sub-item${hasMarkedForDeletion ? ' marked-for-deletion' : ''}`;
    item.setAttribute('role', 'listitem');
    item.setAttribute('tabindex', '0');
    item.setAttribute('data-fault-id', fault.id);
    item.style.cssText = `
      position: absolute;
      left: 0;
      right: 0;
      height: ${SUB_ITEM_HEIGHT}px;
      display: flex;
      align-items: center;
      padding: 0 8px 0 24px;
      gap: 8px;
      background: var(--surface-elevated);
      border-bottom: 1px solid var(--background);
      border-left: 3px solid ${hasMarkedForDeletion ? 'var(--error)' : 'var(--warning)'};
      ${hasMarkedForDeletion ? 'opacity: 0.6;' : ''}
      cursor: pointer;
      transition: background 0.2s;
    `;

    const state = store.getState();
    const lang = state.currentLang;
    const gateColor = store.getGateColor(fault.gateNumber);
    const gateColorHex = gateColor === 'red' ? '#ef4444' : '#3b82f6';

    item.innerHTML = `
      <div style="width: 16px; flex-shrink: 0;"></div>
      <div style="min-width: 44px;"></div>
      <div class="result-point" style="padding: 4px 6px; border-radius: var(--radius); font-size: 0.7rem; font-weight: 600; min-width: 48px; text-align: center; background: var(--warning)20; color: var(--warning);">
        T${fault.gateNumber}
      </div>
      <div style="min-width: 36px; display: flex; align-items: center; justify-content: center;">
        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${gateColorHex};" title="${gateColor}"></div>
      </div>
      <div class="result-info" style="flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0;">
        <span style="font-size: 0.85rem; color: var(--text-secondary); ${hasMarkedForDeletion ? 'text-decoration: line-through;' : ''}">
          ${escapeHtml(fault.faultType)}
        </span>
        ${fault.deviceName ? `
          <span style="font-size: 0.65rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(fault.deviceName)}
          </span>
        ` : ''}
      </div>
      ${hasMarkedForDeletion ? `
        <span class="deletion-pending-status" style="display: flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: var(--radius); font-size: 0.65rem; font-weight: 600; background: var(--error); color: white;">
          DEL
        </span>
      ` : ''}
      <button class="result-edit-btn" aria-label="${t('editFaultLabel', lang)}" style="background: none; border: none; color: var(--primary); padding: 6px; cursor: pointer; opacity: 0.7;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="result-delete fault-delete-btn" aria-label="${t('deleteFaultLabel', lang)}" style="background: none; border: none; color: var(--error); padding: 6px; cursor: pointer; opacity: 0.7;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    `;

    // Track all event listeners for cleanup
    const listeners: ItemListeners = {};

    // Edit button
    const editBtn = item.querySelector('.result-edit-btn') as HTMLButtonElement;
    listeners.editBtn = editBtn;
    listeners.editClick = ((e: Event) => {
      e.stopPropagation();
      const event = new CustomEvent('fault-edit-request', {
        bubbles: true,
        detail: { fault }
      });
      item.dispatchEvent(event);
    }) as EventListener;
    editBtn.addEventListener('click', listeners.editClick);

    // Delete button
    const deleteBtn = item.querySelector('.fault-delete-btn') as HTMLButtonElement;
    listeners.deleteBtn = deleteBtn;
    listeners.deleteClick = ((e: Event) => {
      e.stopPropagation();
      const event = new CustomEvent('fault-delete-request', {
        bubbles: true,
        detail: { fault }
      });
      item.dispatchEvent(event);
    }) as EventListener;
    deleteBtn.addEventListener('click', listeners.deleteClick);

    // Click opens edit
    listeners.click = (() => {
      const event = new CustomEvent('fault-edit-request', {
        bubbles: true,
        detail: { fault }
      });
      item.dispatchEvent(event);
    }) as EventListener;
    item.addEventListener('click', listeners.click);

    // Touch feedback
    listeners.touchstart = (() => {
      item.style.background = 'var(--surface)';
    }) as EventListener;
    item.addEventListener('touchstart', listeners.touchstart, { passive: true });

    listeners.touchend = (() => {
      item.style.background = 'var(--surface-elevated)';
    }) as EventListener;
    item.addEventListener('touchend', listeners.touchend, { passive: true });

    // Keyboard support: Enter/Space to edit, Delete to delete, arrow keys to navigate
    listeners.keydown = ((e: Event) => {
      const ke = e as KeyboardEvent;
      switch (ke.key) {
        case 'Enter':
        case ' ':
        case 'e':
        case 'E':
          ke.preventDefault();
          {
            const event = new CustomEvent('fault-edit-request', {
              bubbles: true,
              detail: { fault }
            });
            item.dispatchEvent(event);
          }
          break;
        case 'Delete':
        case 'd':
        case 'D':
          ke.preventDefault();
          {
            const event = new CustomEvent('fault-delete-request', {
              bubbles: true,
              detail: { fault }
            });
            item.dispatchEvent(event);
          }
          break;
        case 'ArrowDown':
          ke.preventDefault();
          this.focusNextItem(item);
          break;
        case 'ArrowUp':
          ke.preventDefault();
          this.focusPreviousItem(item);
          break;
      }
    }) as EventListener;
    item.addEventListener('keydown', listeners.keydown);

    // Store listeners for cleanup
    this.itemListeners.set(itemId, listeners);

    return item;
  }

  /**
   * Render empty state
   */
  private renderEmpty(): void {
    for (const item of this.visibleItems.values()) {
      item.remove();
    }
    this.visibleItems.clear();

    const state = store.getState();
    this.contentContainer.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">⏱️</span>
        <span>${t('noEntries', state.currentLang)}</span>
        <span class="empty-subtitle">${t('noEntriesHint', state.currentLang)}</span>
      </div>
    `;
  }

  /**
   * Pause rendering (for battery optimization)
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Resume rendering
   */
  resume(): void {
    this.isPaused = false;
    if (this.needsRefreshOnResume) {
      this.needsRefreshOnResume = false;
      this.render();
    }
  }

  /**
   * Scroll to the top of the list
   */
  scrollToTop(): void {
    this.scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Scroll to a specific entry by ID
   * Expands the group containing the entry and scrolls to it
   */
  scrollToEntry(entryId: string | number): void {
    // Find the group containing this entry
    const id = String(entryId);
    const group = this.groups.find(g => g.entries.some(e => e.id === id));
    if (!group) return;

    // Calculate the position of the group
    let offset = 0;
    for (const g of this.groups) {
      if (g.id === group.id) break;
      offset += this.getGroupHeight(g);
    }

    // If it's a multi-item group, expand it
    if (group.isMultiItem) {
      this.expandedGroups.add(group.id);
      // Respect pause state to avoid background rendering
      if (this.isPaused) {
        this.needsRefreshOnResume = true;
      } else {
        this.render();
      }
    }

    // Scroll to the group (skip if paused since view isn't visible)
    if (!this.isPaused) {
      this.scrollContainer.scrollTo({ top: offset, behavior: 'smooth' });
    }
  }

  /**
   * Get the count of visible (filtered) entries
   */
  getVisibleCount(): number {
    // Count all timing entries across all groups (after filtering)
    return this.groups.reduce((sum, group) => sum + group.entries.length, 0);
  }

  /**
   * Get sorted focusable items from the visible items cache
   * This avoids expensive DOM queries on every arrow key press
   */
  private getSortedFocusableItems(): HTMLElement[] {
    // Use visibleItems Map instead of DOM query
    const items = Array.from(this.visibleItems.values());

    // Sort by Y position (transform translateY)
    items.sort((a, b) => {
      const aY = this.getItemYPosition(a);
      const bY = this.getItemYPosition(b);
      return aY - bY;
    });

    return items;
  }

  /**
   * Focus the next focusable item in the list
   */
  private focusNextItem(currentItem: HTMLElement): void {
    const focusableItems = this.getSortedFocusableItems();
    const currentIndex = focusableItems.indexOf(currentItem);
    if (currentIndex >= 0 && currentIndex < focusableItems.length - 1) {
      focusableItems[currentIndex + 1].focus();
    }
  }

  /**
   * Focus the previous focusable item in the list
   */
  private focusPreviousItem(currentItem: HTMLElement): void {
    const focusableItems = this.getSortedFocusableItems();
    const currentIndex = focusableItems.indexOf(currentItem);
    if (currentIndex > 0) {
      focusableItems[currentIndex - 1].focus();
    }
  }

  /**
   * Extract Y position from transform style
   */
  private getItemYPosition(item: HTMLElement): number {
    const transform = item.style.transform;
    const match = transform.match(/translateY\((\d+)px\)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Clean up event listeners for an item
   */
  private cleanupItemListeners(itemId: string, item: HTMLElement): void {
    const listeners = this.itemListeners.get(itemId);
    if (listeners) {
      // Main item listeners
      if (listeners.click) item.removeEventListener('click', listeners.click);
      if (listeners.keydown) item.removeEventListener('keydown', listeners.keydown);
      if (listeners.touchstart) item.removeEventListener('touchstart', listeners.touchstart);
      if (listeners.touchend) item.removeEventListener('touchend', listeners.touchend);
      // Child button listeners
      if (listeners.editBtn && listeners.editClick) {
        listeners.editBtn.removeEventListener('click', listeners.editClick);
      }
      if (listeners.deleteBtn && listeners.deleteClick) {
        listeners.deleteBtn.removeEventListener('click', listeners.deleteClick);
      }
      if (listeners.photoBtn && listeners.photoClick) {
        listeners.photoBtn.removeEventListener('click', listeners.photoClick);
      }
      this.itemListeners.delete(itemId);
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    // Guard against double-destruction
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;

    // Clean up DOM removal observer first (prevents recursive calls)
    if (this.domRemovalObserver) {
      this.domRemovalObserver.disconnect();
      this.domRemovalObserver = null;
    }

    // Clean up scroll listener
    if (this.scrollHandler) {
      this.scrollContainer.removeEventListener('scroll', this.scrollHandler);
      this.scrollHandler = null;
    }

    // Clean up debounce timeouts
    if (this.scrollDebounceTimeout !== null) {
      clearTimeout(this.scrollDebounceTimeout);
      this.scrollDebounceTimeout = null;
    }
    if (this.resizeDebounceTimeout !== null) {
      clearTimeout(this.resizeDebounceTimeout);
      this.resizeDebounceTimeout = null;
    }

    // Clean up resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Clean up store subscription
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    // Clean up all item listeners before removing DOM
    for (const [id, item] of this.visibleItems) {
      this.cleanupItemListeners(id, item);
    }
    this.visibleItems.clear();
    this.itemListeners.clear();

    // Clear DOM
    this.scrollContainer.remove();
  }
}
