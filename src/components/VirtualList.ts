import { t } from '../i18n/translations';
import { ambientModeService } from '../services/ambient';
import type { BatteryLevel } from '../services/battery';
import { batteryService } from '../services/battery';
import {
  $entries,
  $faultEntries,
  $selectedEntries,
  effect,
  store,
} from '../store';
import type { Entry, FaultEntry, Run } from '../types';
import { SwipeActions } from './SwipeActions';
import {
  // Template helpers
  deleteButton,
  deletionPendingBadge,
  duplicateBadge,
  editButton,
  escapeAttr,
  escapeHtml,
  faultBadge,
  formatBib,
  formatTime,
  getFaultTypeLabel,
  getPointColor,
  getPointLabel,
  getRunColor,
  getRunLabel,
  iconChevron,
  photoButton,
  pointBadge,
  runBadge,
  statusBadge,
} from '../utils';
import { logger } from '../utils/logger';

// Group of items for the same bib+run
interface DisplayGroup {
  id: string; // bib-run
  bib: string;
  run: Run;
  entries: Entry[]; // Timing entries (Start, Finish)
  faults: FaultEntry[]; // Fault entries
  isMultiItem: boolean; // Has more than 1 item total
  latestTimestamp: string;
  crossDeviceDuplicateCount: number; // Number of entries with same bib+point+run from different devices
}

// Virtual list configuration
const ITEM_HEIGHT = 78; // Height of each result item in pixels
const SUB_ITEM_HEIGHT = 64; // Height of sub-items when expanded
const GROUP_HEADER_HEIGHT = 72; // Height of group header
const BUFFER_SIZE = 5; // Number of items to render above/below viewport
const SCROLL_DEBOUNCE_NORMAL = 16; // ~60fps
const SCROLL_DEBOUNCE_LOW = 33; // ~30fps
const SCROLL_DEBOUNCE_CRITICAL = 50; // ~20fps
const RESIZE_DEBOUNCE = 100; // Debounce resize events for battery efficiency

/** Get scroll debounce delay based on battery level */
function getScrollDebounce(batteryLevel: BatteryLevel): number {
  switch (batteryLevel) {
    case 'critical':
      return SCROLL_DEBOUNCE_CRITICAL;
    case 'low':
      return SCROLL_DEBOUNCE_LOW;
    default:
      return SCROLL_DEBOUNCE_NORMAL;
  }
}

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
  private swipeActions: Map<string, SwipeActions> = new Map();
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
  private scrollDebounceDelay: number = SCROLL_DEBOUNCE_NORMAL;
  private unsubscribeBattery: (() => void) | null = null;

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

    // Set up scroll listener with cancellable debounce (battery-aware)
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
      }, this.scrollDebounceDelay);
    };
    this.scrollContainer.addEventListener('scroll', this.scrollHandler, {
      passive: true,
    });

    // Subscribe to battery status for adaptive scroll debounce
    this.unsubscribeBattery = batteryService.subscribe((status) => {
      this.scrollDebounceDelay = getScrollDebounce(status.batteryLevel);
    });

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

    // React to store updates via signals
    this.unsubscribe = effect(() => {
      const entries = $entries.value;
      void $selectedEntries.value;
      void $faultEntries.value;
      this.setEntries(entries);
    });

    // Watch for container removal from DOM to auto-cleanup (prevents memory leak)
    this.domRemovalObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const removedNode of mutation.removedNodes) {
          if (
            removedNode === this.container ||
            removedNode.contains?.(this.container)
          ) {
            this.destroy();
            return;
          }
        }
      }
    });
    // Observe the direct parent for container removal (no subtree needed)
    const observeTarget = this.container.parentElement || document.body;
    this.domRemovalObserver.observe(observeTarget, {
      childList: true,
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
   * Apply current filters and group items
   */
  applyFilters(
    searchTerm?: string,
    pointFilter?: string,
    statusFilter?: string,
  ): void {
    // Cancel any pending scroll-triggered render to prevent double-render
    if (this.scrollDebounceTimeout !== null) {
      clearTimeout(this.scrollDebounceTimeout);
      this.scrollDebounceTimeout = null;
    }

    const state = store.getState();
    let filteredEntries = [...this.entries];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filteredEntries = filteredEntries.filter(
        (e) =>
          e.bib.toLowerCase().includes(term) ||
          e.deviceName?.toLowerCase().includes(term),
      );
    }

    if (pointFilter && pointFilter !== 'all') {
      filteredEntries = filteredEntries.filter((e) => e.point === pointFilter);
    }

    if (statusFilter && statusFilter !== 'all') {
      filteredEntries = filteredEntries.filter(
        (e) => e.status === statusFilter,
      );
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
          latestTimestamp: entry.timestamp,
          crossDeviceDuplicateCount: 0,
        });
      }

      const group = groupMap.get(key)!;
      group.entries.push(entry);
      // ISO 8601 timestamps are lexicographically sortable — avoid Date allocations
      if (entry.timestamp > group.latestTimestamp) {
        group.latestTimestamp = entry.timestamp;
      }
    }

    // Add faults to groups
    for (const fault of state.faultEntries) {
      const key = `${fault.bib}-${fault.run}`;

      // Apply search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (
          !fault.bib.toLowerCase().includes(term) &&
          !fault.deviceName?.toLowerCase().includes(term)
        ) {
          continue;
        }
      }

      // Skip faults if point filter is set (faults don't have S/F)
      if (pointFilter && pointFilter !== 'all') {
        continue;
      }

      // For status filter, include faults when filtering for dsq/flt or all
      if (
        statusFilter &&
        statusFilter !== 'all' &&
        statusFilter !== 'dsq' &&
        statusFilter !== 'flt'
      ) {
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
          latestTimestamp: fault.timestamp,
          crossDeviceDuplicateCount: 0,
        });
      }

      const group = groupMap.get(key)!;
      group.faults.push(fault);
      if (fault.timestamp > group.latestTimestamp) {
        group.latestTimestamp = fault.timestamp;
      }
    }

    // Calculate isMultiItem and cross-device duplicates for each group
    for (const group of groupMap.values()) {
      const totalItems = group.entries.length + group.faults.length;
      group.isMultiItem = totalItems > 1;

      // Detect cross-device duplicates: same bib+point+run from different deviceIds
      const pointDeviceMap = new Map<string, Set<string>>();
      for (const entry of group.entries) {
        const pointKey = entry.point;
        if (!pointDeviceMap.has(pointKey)) {
          pointDeviceMap.set(pointKey, new Set());
        }
        pointDeviceMap.get(pointKey)!.add(entry.deviceId);
      }
      let dupCount = 0;
      for (const devices of pointDeviceMap.values()) {
        if (devices.size > 1) {
          dupCount++;
        }
      }
      group.crossDeviceDuplicateCount = dupCount;
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

    // Only clear items belonging to the toggled group (other groups stay in DOM)
    const group = this.groups.find((g) => g.id === groupId);
    if (group) {
      const groupItemIds = new Set<string>();
      groupItemIds.add(`header-${groupId}`);
      // Always clean up single-item variant (may linger if group upgraded from single→multi)
      groupItemIds.add(`single-${groupId}`);
      for (const entry of group.entries) {
        groupItemIds.add(`sub-entry-${entry.id}`);
      }
      for (const fault of group.faults) {
        groupItemIds.add(`sub-fault-${fault.id}`);
      }

      for (const itemId of groupItemIds) {
        const item = this.visibleItems.get(itemId);
        if (item) {
          this.cleanupItemListeners(itemId, item);
          item.remove();
          this.visibleItems.delete(itemId);
        }
      }
    }

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
        totalHeight += GROUP_HEADER_HEIGHT + subItemCount * SUB_ITEM_HEIGHT;
      } else {
        // Collapsed group - just header
        totalHeight += GROUP_HEADER_HEIGHT;
      }
    }

    this.contentContainer.style.height = `${totalHeight}px`;
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
      return GROUP_HEADER_HEIGHT + subItemCount * SUB_ITEM_HEIGHT;
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

    const visibleIds = new Set<string>();
    const viewportTop = this.scrollTop;
    const viewportBottom = this.scrollTop + this.containerHeight;

    // Render visible groups
    let currentY = 0;

    for (let i = 0; i < this.groups.length; i++) {
      const group = this.groups[i]!;
      const groupHeight = this.getGroupHeight(group);
      const groupBottom = currentY + groupHeight;

      // Check if group is in viewport (with buffer)
      const inViewport =
        groupBottom >= viewportTop - BUFFER_SIZE * ITEM_HEIGHT &&
        currentY <= viewportBottom + BUFFER_SIZE * ITEM_HEIGHT;

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
  private renderSingleItem(
    group: DisplayGroup,
    yPosition: number,
    visibleIds: Set<string>,
  ): void {
    const itemId = `single-${group.id}`;
    visibleIds.add(itemId);

    let item = this.visibleItems.get(itemId);

    if (!item) {
      if (group.entries.length > 0) {
        item = this.createEntryItem(
          group.entries[0]!,
          group.faults,
          itemId,
          group.crossDeviceDuplicateCount,
        );
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
  private renderCollapsedGroup(
    group: DisplayGroup,
    yPosition: number,
    visibleIds: Set<string>,
  ): void {
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
  private renderExpandedGroup(
    group: DisplayGroup,
    yPosition: number,
    visibleIds: Set<string>,
  ): void {
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
      const entry = group.entries[i]!;
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
      const fault = group.faults[i]!;
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
  private createGroupHeader(
    group: DisplayGroup,
    isExpanded: boolean,
  ): HTMLElement {
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
      display: grid;
      grid-template-columns: 28px 64px minmax(0, 1fr) auto;
      align-items: center;
      padding: 0 16px;
      column-gap: 12px;
      background: var(--surface);
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
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
      summaryParts.push(
        `${entryCount} ${t(entryCount === 1 ? 'timeEntry' : 'timeEntries', lang)}`,
      );
    }
    if (faultCount > 0) {
      summaryParts.push(
        `${faultCount} ${t(faultCount === 1 ? 'faultEntry' : 'faultEntries', lang)}`,
      );
    }
    const summaryText = summaryParts.join(', ');

    header.innerHTML = `
      ${iconChevron(16, isExpanded)}
      <div class="result-bib" style="font-family: var(--font-mono); font-size: 1.4rem; font-weight: 700; text-align: center; color: var(--text-primary); letter-spacing: 0.02em;">
        ${escapeHtml(bibStr)}
      </div>
      <div class="result-info" style="display: flex; flex-direction: column; gap: 2px; min-width: 0;">
        <div class="result-summary" style="font-size: 0.875rem; color: var(--text-secondary);">
          ${escapeHtml(summaryText)}
        </div>
      </div>
      <div class="result-tags" style="display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: max-content;">
        ${group.crossDeviceDuplicateCount > 0 ? duplicateBadge(lang) : ''}
        ${
          hasFaults
            ? `<span class="result-fault-badge" style="padding: 2px 6px; border-radius: var(--radius); font-size: 0.7rem; font-weight: 600; background: var(--warning); color: #000;">
            ${faultCount}\u00D7 ${t('flt', lang)}
          </span>`
            : ''
        }
        ${runBadge(runLabel, runColor)}
      </div>
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

    // Touch feedback is handled by CSS :active pseudo-class

    // Store listeners for cleanup
    this.itemListeners.set(headerId, listeners);

    return header;
  }

  /**
   * Create a timing entry item (for single-item groups)
   */
  private createEntryItem(
    entry: Entry,
    faults: FaultEntry[],
    itemId: string,
    crossDeviceDuplicateCount = 0,
  ): HTMLElement {
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
      display: grid;
      grid-template-columns: 28px 64px minmax(0, 1fr) auto;
      align-items: center;
      padding: 0 16px;
      column-gap: 12px;
      background: var(--surface);
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
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
    const runLabel = getRunLabel(run, lang);

    const faultBadgeHtml =
      faults.length > 0 ? faultBadge({ faults, lang }) : '';

    const duplicateBadgeHtml =
      crossDeviceDuplicateCount > 0 ? duplicateBadge(lang) : '';

    const dateStr = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
    const deviceDateStr = entry.deviceName
      ? `${escapeHtml(entry.deviceName)}  ·  ${dateStr}`
      : dateStr;

    item.innerHTML = `
      <div></div>
      <div class="result-bib" style="font-family: var(--font-mono); font-size: 1.4rem; font-weight: 700; text-align: center; color: var(--text-primary); letter-spacing: 0.02em;">
        ${escapeHtml(bibStr)}
      </div>
      <div class="result-info" style="display: flex; flex-direction: column; gap: 2px; min-width: 0;">
        <div class="result-time" style="font-family: var(--font-mono); color: var(--text-primary); font-size: 1rem; font-weight: 600; letter-spacing: 0.03em;">
          ${escapeHtml(timeStr)}
        </div>
        <div class="result-device" style="font-size: 0.68rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); letter-spacing: 0.04em;">
          ${deviceDateStr}
        </div>
      </div>
      <div class="result-tags" style="display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: max-content;">
        ${duplicateBadgeHtml}
        ${faultBadgeHtml}
        ${entry.status !== 'ok' ? statusBadge(t(entry.status, lang)) : ''}
        ${entry.photo ? photoButton(t('viewPhotoLabel', lang)) : ''}
        ${pointBadge(pointLabel, pointColor)}
        ${runBadge(runLabel, getRunColor(run))}
        ${editButton({ ariaLabel: t('editEntryLabel', lang) })}
        ${deleteButton({ ariaLabel: t('deleteEntryLabel', lang) })}
      </div>
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
    const photoBtn = item.querySelector(
      '.result-photo-btn',
    ) as HTMLButtonElement | null;
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

    // Touch feedback is handled by CSS :active pseudo-class

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

    // Enable swipe gestures: right to edit, left to delete
    this.swipeActions.set(
      itemId,
      new SwipeActions({
        element: item,
        onSwipeRight: () => this.options.onItemClick?.(entry, new MouseEvent('click')),
        onSwipeLeft: () => this.options.onItemDelete?.(entry),
      }),
    );

    return item;
  }

  /**
   * Create a fault-only item (for single-item groups with only faults)
   */
  private createFaultOnlyItem(
    group: DisplayGroup,
    itemId: string,
  ): HTMLElement {
    const item = document.createElement('div');
    const faults = group.faults;
    const hasMarkedForDeletion = faults.some((f) => f.markedForDeletion);

    item.className = `result-item fault-only-item${hasMarkedForDeletion ? ' marked-for-deletion' : ''}`;
    item.setAttribute('role', 'listitem');
    item.setAttribute('tabindex', '0');
    item.setAttribute('data-fault-id', group.id);
    item.style.cssText = `
      position: absolute;
      left: 0;
      right: 0;
      height: ${ITEM_HEIGHT}px;
      display: grid;
      grid-template-columns: 28px 64px minmax(0, 1fr) auto;
      align-items: center;
      padding: 0 16px;
      column-gap: 12px;
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
      .map(
        (f) =>
          `T${f.gateNumber} (${getFaultTypeLabel(f.faultType, lang)})${f.markedForDeletion ? ' ⚠' : ''}`,
      )
      .join(', ');

    const faultBadgeHtml = faultBadge({ faults, lang });

    const statusLabel = state.usePenaltyMode ? t('flt', lang) : t('dsq', lang);
    const statusColor = state.usePenaltyMode ? '#f59e0b' : '#ef4444';

    const deletionPendingHtml = hasMarkedForDeletion
      ? deletionPendingBadge()
      : '';

    item.innerHTML = `
      <div></div>
      <div class="result-bib" style="font-family: var(--font-mono); font-size: 1.4rem; font-weight: 700; text-align: center; ${hasMarkedForDeletion ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
        ${escapeHtml(bibStr)}
      </div>
      <div class="result-info" style="display: flex; flex-direction: column; gap: 2px; min-width: 0;">
        <div class="result-fault-details" style="font-size: 0.8rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; ${hasMarkedForDeletion ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
          ${escapeHtml(faultDetails)}
        </div>
        ${
          faults[0]?.deviceName
            ? `
          <div class="result-device" style="font-size: 0.7rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(faults[0].deviceName)}
          </div>
        `
            : ''
        }
      </div>
      <div class="result-tags" style="display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: max-content;">
        ${deletionPendingHtml}
        ${!hasMarkedForDeletion ? faultBadgeHtml : ''}
        ${!hasMarkedForDeletion ? statusBadge(statusLabel, statusColor) : ''}
        ${pointBadge(t('gate', lang), 'var(--warning)')}
        ${runBadge(runLabel, runColor)}
        ${editButton({ ariaLabel: t('editFaultLabel', lang) })}
        ${deleteButton({ ariaLabel: t('deleteFaultLabel', lang), className: 'result-delete fault-delete-btn' })}
      </div>
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
          detail: { fault: faults[0] },
        });
        item.dispatchEvent(event);
      }) as EventListener;
      editBtn.addEventListener('click', listeners.editClick);
    }

    // Delete button
    const deleteBtn = item.querySelector(
      '.fault-delete-btn',
    ) as HTMLButtonElement;
    if (deleteBtn && faults.length > 0) {
      listeners.deleteBtn = deleteBtn;
      listeners.deleteClick = ((e: Event) => {
        e.stopPropagation();
        const event = new CustomEvent('fault-delete-request', {
          bubbles: true,
          detail: { fault: faults[0] },
        });
        item.dispatchEvent(event);
      }) as EventListener;
      deleteBtn.addEventListener('click', listeners.deleteClick);
    }

    // Click opens edit modal for first fault
    listeners.click = ((e: Event) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('.fault-delete-btn') ||
        target.closest('.result-edit-btn')
      )
        return;

      if (faults.length > 0) {
        const event = new CustomEvent('fault-edit-request', {
          bubbles: true,
          detail: { fault: faults[0] },
        });
        item.dispatchEvent(event);
      }
    }) as EventListener;
    item.addEventListener('click', listeners.click);

    // Touch feedback is handled by CSS :active pseudo-class

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
              detail: { fault: faults[0] },
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
              detail: { fault: faults[0] },
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

    // Enable swipe gestures: right to edit, left to delete
    if (faults.length > 0) {
      this.swipeActions.set(
        itemId,
        new SwipeActions({
          element: item,
          onSwipeRight: () => {
            item.dispatchEvent(new CustomEvent('fault-edit-request', {
              bubbles: true,
              detail: { fault: faults[0] },
            }));
          },
          onSwipeLeft: () => {
            item.dispatchEvent(new CustomEvent('fault-delete-request', {
              bubbles: true,
              detail: { fault: faults[0] },
            }));
          },
        }),
      );
    }

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
      display: grid;
      grid-template-columns: 28px 64px minmax(0, 1fr) auto;
      align-items: center;
      padding: 0 16px;
      column-gap: 12px;
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
      <div></div>
      ${pointBadge(pointLabel, pointColor, '64px', '0.7rem')}
      <div class="result-info" style="display: flex; align-items: center; gap: 8px; min-width: 0;">
        <div class="result-time" style="font-family: var(--font-mono); color: var(--text-secondary); font-size: 0.85rem;">
          ${escapeHtml(timeStr)}
        </div>
        ${
          entry.deviceName
            ? `
          <div class="result-device" style="font-size: 0.65rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(entry.deviceName)}
          </div>
        `
            : ''
        }
      </div>
      <div class="result-tags" style="display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: max-content;">
        ${entry.status !== 'ok' ? statusBadge(t(entry.status, lang), 'var(--error)', '0.65rem') : ''}
        ${editButton({ ariaLabel: t('editEntryLabel', lang), size: 16 })}
        ${deleteButton({ ariaLabel: t('deleteEntryLabel', lang), size: 16 })}
      </div>
    `;

    // Track all event listeners for cleanup
    const listeners: ItemListeners = {};

    // Edit button
    const editBtn = item.querySelector('.result-edit-btn') as HTMLButtonElement;
    listeners.editBtn = editBtn;
    listeners.editClick = ((e: Event) => {
      e.stopPropagation();
      if (ambientModeService.wasRecentlyExited()) return;
      this.options.onItemClick?.(entry, e as MouseEvent);
    }) as EventListener;
    editBtn.addEventListener('click', listeners.editClick);

    // Delete button
    const deleteBtn = item.querySelector('.result-delete') as HTMLButtonElement;
    listeners.deleteBtn = deleteBtn;
    listeners.deleteClick = ((e: Event) => {
      e.stopPropagation();
      if (ambientModeService.wasRecentlyExited()) return;
      this.options.onItemDelete?.(entry);
    }) as EventListener;
    deleteBtn.addEventListener('click', listeners.deleteClick);

    // Click on row opens edit
    listeners.click = ((e: Event) => {
      if (ambientModeService.wasRecentlyExited()) return;
      this.options.onItemClick?.(entry, e as MouseEvent);
    }) as EventListener;
    item.addEventListener('click', listeners.click);

    // Touch feedback is handled by CSS :active pseudo-class

    // Keyboard support: Enter/Space to edit, Delete to delete, arrow keys to navigate
    listeners.keydown = ((e: Event) => {
      const ke = e as KeyboardEvent;
      if (ambientModeService.wasRecentlyExited()) return;
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

    // Enable swipe gestures: right to edit, left to delete
    this.swipeActions.set(
      itemId,
      new SwipeActions({
        element: item,
        onSwipeRight: () => { if (!ambientModeService.wasRecentlyExited()) this.options.onItemClick?.(entry, new MouseEvent('click')); },
        onSwipeLeft: () => { if (!ambientModeService.wasRecentlyExited()) this.options.onItemDelete?.(entry); },
      }),
    );

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
      display: grid;
      grid-template-columns: 28px 64px minmax(0, 1fr) auto;
      align-items: center;
      padding: 0 16px;
      column-gap: 12px;
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
      <div></div>
      <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
        ${pointBadge(`T${fault.gateNumber}`, 'var(--warning)', 'auto', '0.7rem')}
        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${gateColorHex}; flex-shrink: 0;" title="${escapeAttr(gateColor)}"></div>
      </div>
      <div class="result-info" style="display: flex; align-items: center; gap: 8px; min-width: 0;">
        <span style="font-size: 0.85rem; color: var(--text-secondary); ${hasMarkedForDeletion ? 'text-decoration: line-through;' : ''}">
          ${escapeHtml(getFaultTypeLabel(fault.faultType, lang))}
        </span>
        ${
          fault.deviceName
            ? `
          <span style="font-size: 0.65rem; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(fault.deviceName)}
          </span>
        `
            : ''
        }
      </div>
      <div class="result-tags" style="display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: max-content;">
        ${hasMarkedForDeletion ? deletionPendingBadge('0.65rem') : ''}
        ${editButton({ ariaLabel: t('editFaultLabel', lang), size: 16 })}
        ${deleteButton({ ariaLabel: t('deleteFaultLabel', lang), size: 16, className: 'result-delete fault-delete-btn' })}
      </div>
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
        detail: { fault },
      });
      item.dispatchEvent(event);
    }) as EventListener;
    editBtn.addEventListener('click', listeners.editClick);

    // Delete button
    const deleteBtn = item.querySelector(
      '.fault-delete-btn',
    ) as HTMLButtonElement;
    listeners.deleteBtn = deleteBtn;
    listeners.deleteClick = ((e: Event) => {
      e.stopPropagation();
      const event = new CustomEvent('fault-delete-request', {
        bubbles: true,
        detail: { fault },
      });
      item.dispatchEvent(event);
    }) as EventListener;
    deleteBtn.addEventListener('click', listeners.deleteClick);

    // Click opens edit
    listeners.click = (() => {
      const event = new CustomEvent('fault-edit-request', {
        bubbles: true,
        detail: { fault },
      });
      item.dispatchEvent(event);
    }) as EventListener;
    item.addEventListener('click', listeners.click);

    // Touch feedback is handled by CSS :active pseudo-class

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
              detail: { fault },
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
              detail: { fault },
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

    // Enable swipe gestures: right to edit, left to delete
    this.swipeActions.set(
      itemId,
      new SwipeActions({
        element: item,
        onSwipeRight: () => {
          item.dispatchEvent(new CustomEvent('fault-edit-request', {
            bubbles: true,
            detail: { fault },
          }));
        },
        onSwipeLeft: () => {
          item.dispatchEvent(new CustomEvent('fault-delete-request', {
            bubbles: true,
            detail: { fault },
          }));
        },
      }),
    );

    return item;
  }

  /**
   * Render empty state
   */
  private renderEmpty(): void {
    for (const [id, item] of this.visibleItems.entries()) {
      this.cleanupItemListeners(id, item);
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
    const group = this.groups.find((g) => g.entries.some((e) => e.id === id));
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
      focusableItems[currentIndex + 1]!.focus();
    }
  }

  /**
   * Focus the previous focusable item in the list
   */
  private focusPreviousItem(currentItem: HTMLElement): void {
    const focusableItems = this.getSortedFocusableItems();
    const currentIndex = focusableItems.indexOf(currentItem);
    if (currentIndex > 0) {
      focusableItems[currentIndex - 1]!.focus();
    }
  }

  /**
   * Extract Y position from transform style
   */
  private getItemYPosition(item: HTMLElement): number {
    const transform = item.style.transform;
    const match = transform.match(/translateY\((-?\d+)px\)/);
    return match ? parseInt(match[1]!, 10) : 0;
  }

  /**
   * Clean up event listeners for an item
   */
  private cleanupItemListeners(itemId: string, item: HTMLElement): void {
    // Destroy SwipeActions instance before removing event listeners
    const swipe = this.swipeActions.get(itemId);
    if (swipe) {
      swipe.destroy();
      this.swipeActions.delete(itemId);
    }

    const listeners = this.itemListeners.get(itemId);
    if (listeners) {
      // Main item listeners
      if (listeners.click) item.removeEventListener('click', listeners.click);
      if (listeners.keydown)
        item.removeEventListener('keydown', listeners.keydown);
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

    // Clean up battery subscription
    if (this.unsubscribeBattery) {
      this.unsubscribeBattery();
      this.unsubscribeBattery = null;
    }

    // Clean up all item listeners before removing DOM
    for (const [id, item] of this.visibleItems) {
      this.cleanupItemListeners(id, item);
    }
    this.visibleItems.clear();
    this.itemListeners.clear();
    this.swipeActions.clear();

    // Clear DOM
    this.scrollContainer.remove();
  }
}
