// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PWAInstallButton } from './PWAInstallButton';

const { usePWAInstall } = vi.hoisted(() => ({ usePWAInstall: vi.fn() }));
vi.mock('../../hooks/usePWAInstall', () => ({ usePWAInstall }));

describe('PWAInstallButton', () => {
  beforeEach(() => {
    usePWAInstall.mockReset();
  });

  it('invokes the browser install flow when available', async () => {
    const install = vi.fn();
    usePWAInstall.mockReturnValue({ isInstallable: true, isInstalled: false, isIOS: false, install });
    const user = userEvent.setup();
    render(<PWAInstallButton />);

    await user.click(screen.getByRole('button', { name: 'Установить' }));
    expect(install).toHaveBeenCalledOnce();
  });

  it('provides an accessible iOS installation guide', async () => {
    usePWAInstall.mockReturnValue({ isInstallable: false, isInstalled: false, isIOS: true, install: vi.fn() });
    const user = userEvent.setup();
    render(<PWAInstallButton />);

    await user.click(screen.getByRole('button', { name: 'На экран' }));
    expect(screen.getByRole('heading', { name: 'Установка на iPhone / iPad' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('heading', { name: 'Установка на iPhone / iPad' })).not.toBeInTheDocument();
  });
});
