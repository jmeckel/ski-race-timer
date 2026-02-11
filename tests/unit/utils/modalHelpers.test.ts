import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before importing
vi.mock('../../../src/features/modals', () => ({
  openModal: vi.fn(),
}));
vi.mock('../../../src/utils/modalContext', () => ({
  setModalContext: vi.fn(),
}));

import { openModal } from '../../../src/features/modals';
import { setModalContext } from '../../../src/utils/modalContext';
import { openModalWithContext } from '../../../src/utils/modalHelpers';

describe('openModalWithContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets context and opens modal', () => {
    const modal = document.createElement('div');
    const context = { faultId: '123', action: 'delete' };

    openModalWithContext(modal, context);

    expect(setModalContext).toHaveBeenCalledWith(modal, context);
    expect(openModal).toHaveBeenCalledWith(modal);
  });

  it('does nothing when modal is null', () => {
    openModalWithContext(null, { key: 'value' });

    expect(setModalContext).not.toHaveBeenCalled();
    expect(openModal).not.toHaveBeenCalled();
  });
});
