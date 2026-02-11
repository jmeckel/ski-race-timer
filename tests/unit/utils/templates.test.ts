import { describe, it, expect } from 'vitest';
import {
  iconTrash,
  iconTrashDetailed,
  iconEdit,
  iconCheck,
  iconX,
  iconChevron,
  iconDuplicate,
  iconCamera,
  iconWarningCircle,
  iconTimer,
  iconFlag,
  iconNote,
  iconHourglass,
  editButton,
  deleteButton,
  photoButton,
  statusBadge,
  deletionPendingBadge,
  runBadge,
  pointBadge,
  faultBadge,
} from '../../../src/utils/templates';

describe('templates', () => {
  describe('icon functions', () => {
    it('iconTrash returns SVG with default size', () => {
      const svg = iconTrash();
      expect(svg).toContain('width="18"');
      expect(svg).toContain('aria-hidden="true"');
    });

    it('iconTrash accepts custom size', () => {
      expect(iconTrash(24)).toContain('width="24"');
    });

    it('iconTrashDetailed includes vertical lines', () => {
      const svg = iconTrashDetailed();
      expect(svg).toContain('width="14"');
      expect(svg).toContain('<line');
    });

    it('iconEdit returns pencil SVG', () => {
      expect(iconEdit()).toContain('width="18"');
      expect(iconEdit(20)).toContain('width="20"');
    });

    it('iconCheck returns checkmark SVG', () => {
      const svg = iconCheck();
      expect(svg).toContain('width="16"');
      expect(svg).toContain('stroke-width="2.5"');
    });

    it('iconCheck accepts custom stroke width', () => {
      expect(iconCheck(20, 3)).toContain('stroke-width="3"');
    });

    it('iconX returns close SVG', () => {
      expect(iconX()).toContain('width="16"');
      expect(iconX(20, 3)).toContain('stroke-width="3"');
    });

    it('iconChevron returns chevron SVG', () => {
      const svg = iconChevron();
      expect(svg).toContain('class="group-chevron"');
      expect(svg).not.toContain('rotate(90deg)');
    });

    it('iconChevron supports rotation', () => {
      expect(iconChevron(16, true)).toContain('rotate(90deg)');
    });

    it('iconDuplicate returns copy SVG', () => {
      expect(iconDuplicate()).toContain('width="12"');
    });

    it('iconCamera returns camera SVG', () => {
      expect(iconCamera()).toContain('width="18"');
    });

    it('iconWarningCircle returns warning SVG', () => {
      expect(iconWarningCircle()).toContain('width="12"');
    });

    it('iconTimer returns stopwatch SVG', () => {
      expect(iconTimer()).toContain('width="18"');
    });

    it('iconFlag returns flag SVG', () => {
      expect(iconFlag()).toContain('width="18"');
    });

    it('iconNote returns document SVG', () => {
      expect(iconNote()).toContain('width="14"');
    });

    it('iconHourglass returns hourglass SVG', () => {
      expect(iconHourglass()).toContain('width="16"');
    });
  });

  describe('composite UI patterns', () => {
    it('editButton creates button with aria-label', () => {
      const html = editButton({ ariaLabel: 'Edit entry' });
      expect(html).toContain('aria-label="Edit entry"');
      expect(html).toContain('result-edit-btn');
    });

    it('editButton accepts custom className', () => {
      const html = editButton({ ariaLabel: 'Edit', className: 'custom-btn' });
      expect(html).toContain('class="custom-btn"');
    });

    it('deleteButton creates button with aria-label', () => {
      const html = deleteButton({ ariaLabel: 'Delete entry' });
      expect(html).toContain('aria-label="Delete entry"');
      expect(html).toContain('result-delete');
    });

    it('photoButton creates camera button', () => {
      const html = photoButton('View photo');
      expect(html).toContain('aria-label="View photo"');
      expect(html).toContain('result-photo-btn');
    });

    it('statusBadge renders status text', () => {
      const html = statusBadge('DNS');
      expect(html).toContain('DNS');
      expect(html).toContain('result-status');
    });

    it('statusBadge accepts custom colors', () => {
      const html = statusBadge('OK', 'green', 'black');
      expect(html).toContain('green');
      expect(html).toContain('black');
    });

    it('deletionPendingBadge renders DEL badge', () => {
      const html = deletionPendingBadge();
      expect(html).toContain('DEL');
      expect(html).toContain('deletion-pending-status');
    });

    it('runBadge renders run label', () => {
      const html = runBadge('L1', '#3b82f6');
      expect(html).toContain('L1');
      expect(html).toContain('result-run');
    });

    it('pointBadge renders point label', () => {
      const html = pointBadge('Start', '#f97316');
      expect(html).toContain('Start');
      expect(html).toContain('result-point');
    });

    it('faultBadge returns empty for no faults', () => {
      expect(faultBadge({ faults: [], lang: 'en' })).toBe('');
    });

    it('faultBadge renders single fault with gate number', () => {
      const html = faultBadge({
        faults: [{ gateNumber: 5, faultType: 'MG' }],
        lang: 'en',
      });
      expect(html).toContain('T5');
      expect(html).toContain('result-fault-badge');
    });

    it('faultBadge renders multiple faults with count', () => {
      const html = faultBadge({
        faults: [
          { gateNumber: 3, faultType: 'MG' },
          { gateNumber: 7, faultType: 'STR' },
        ],
        lang: 'en',
      });
      expect(html).toContain('2');
    });
  });
});
