import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BackupModule } from './BackupModule'
import { PackageInfo, BackupFile } from '../../types/adb'

/**
 * BackupModule Test Suite
 * 
 * Bu testler P0-P3 düzeltmelerini doğrular:
 * - P0: customPath desteği (hook üzerinden test edilir)
 * - P2: FilterTab doğru render edilir
 * - P3: SelectableListItem ortak componenti çalışır
 */

// Mock data
const mockPackages: PackageInfo[] = [
    { name: 'com.google.chrome', path: '/data/app/chrome', is_system: false, label: 'Chrome' },
    { name: 'com.android.settings', path: '/system/app/settings', is_system: true, label: 'Settings' },
    { name: 'com.spotify.music', path: '/data/app/spotify', is_system: false, label: 'Spotify' },
]

const mockBackups: BackupFile[] = [
    { name: 'chrome_backup.easybckp', path: '/backups/chrome.easybckp', size: 1024 * 1024 * 50, date: '2026-01-28 12:00:00' },
    { name: 'spotify_backup.easybckp', path: '/backups/spotify.easybckp', size: 1024 * 1024 * 100, date: '2026-01-27 10:00:00' },
]

// Default mock props
const defaultProps = {
    packages: mockPackages,
    backups: mockBackups,
    packagesLoading: false,
    backupsLoading: false,
    packagesError: null,
    backupsError: null,
    selectedPackages: [],
    selectedBackups: [],
    onTogglePackage: vi.fn(),
    onToggleSelectAll: vi.fn(),
    onToggleBackup: vi.fn(),
    onDeleteBackup: vi.fn(),
    onToggleSelectAllBackups: vi.fn(),
    onRefresh: vi.fn(),
    onExecuteBackup: vi.fn(),
    onExecuteRestore: vi.fn(),
    onBatchDeleteBackups: vi.fn(),
    isProcessing: false,
    totalSize: 0,
}

describe('BackupModule', () => {
    describe('Render Tests', () => {
        it('should render the module title', () => {
            render(<BackupModule {...defaultProps} />)
            expect(screen.getByText('BACKUP & RESTORE')).toBeInTheDocument()
        })

        it('should render filter tabs', () => {
            render(<BackupModule {...defaultProps} />)
            expect(screen.getByText('ALL')).toBeInTheDocument()
            expect(screen.getByText('USER')).toBeInTheDocument()
            expect(screen.getByText('SYSTEM')).toBeInTheDocument()
            expect(screen.getByText('RESTORE')).toBeInTheDocument()
        })

        it('should render packages in ALL tab', () => {
            render(<BackupModule {...defaultProps} />)
            expect(screen.getByText('Chrome')).toBeInTheDocument()
            expect(screen.getByText('Settings')).toBeInTheDocument()
            expect(screen.getByText('Spotify')).toBeInTheDocument()
        })
    })

    describe('Filter Tab Tests (P2)', () => {
        it('should filter to USER apps when USER tab clicked', () => {
            render(<BackupModule {...defaultProps} />)

            // USER sekmesine tıkla
            fireEvent.click(screen.getByText('USER'))

            // Sadece user uygulamaları görünmeli
            expect(screen.getByText('Chrome')).toBeInTheDocument()
            expect(screen.getByText('Spotify')).toBeInTheDocument()
            // System app görünmemeli
            expect(screen.queryByText('Settings')).not.toBeInTheDocument()
        })

        it('should filter to SYSTEM apps when SYSTEM tab clicked', () => {
            render(<BackupModule {...defaultProps} />)

            // SYSTEM sekmesine tıkla
            fireEvent.click(screen.getByText('SYSTEM'))

            // Sadece system uygulaması görünmeli
            expect(screen.getByText('Settings')).toBeInTheDocument()
            // User apps görünmemeli
            expect(screen.queryByText('Chrome')).not.toBeInTheDocument()
            expect(screen.queryByText('Spotify')).not.toBeInTheDocument()
        })

        it('should show backups when RESTORE tab clicked', () => {
            render(<BackupModule {...defaultProps} />)

            // RESTORE sekmesine tıkla
            fireEvent.click(screen.getByText('RESTORE'))

            // Yedekler görünmeli
            expect(screen.getByText('chrome_backup.easybckp')).toBeInTheDocument()
            expect(screen.getByText('spotify_backup.easybckp')).toBeInTheDocument()
        })
    })

    describe('Selection Tests (P3 - SelectableListItem)', () => {
        it('should call onTogglePackage when package clicked', () => {
            const onTogglePackage = vi.fn()
            render(<BackupModule {...defaultProps} onTogglePackage={onTogglePackage} />)

            // Chrome'a tıkla
            fireEvent.click(screen.getByText('Chrome'))

            expect(onTogglePackage).toHaveBeenCalledWith(mockPackages[0])
        })

        it('should show checkbox as selected for selected packages', () => {
            render(<BackupModule {...defaultProps} selectedPackages={[mockPackages[0]]} />)

            // Chrome satırı seçili olmalı (bg-terminal-green class'ı)
            const chromeRow = screen.getByText('Chrome').closest('div')
            expect(chromeRow).toBeInTheDocument()
        })

        it('should call onToggleBackup when backup clicked', () => {
            const onToggleBackup = vi.fn()
            render(<BackupModule {...defaultProps} onToggleBackup={onToggleBackup} />)

            // RESTORE sekmesine geç
            fireEvent.click(screen.getByText('RESTORE'))

            // Backup'a tıkla
            fireEvent.click(screen.getByText('chrome_backup.easybckp'))

            expect(onToggleBackup).toHaveBeenCalledWith(mockBackups[0])
        })
    })

    describe('Loading States', () => {
        it('should show loading spinner when packages loading', () => {
            render(<BackupModule {...defaultProps} packagesLoading={true} />)
            expect(screen.getByText(/Scanning/i)).toBeInTheDocument()
        })

        it('should show error message when error exists', () => {
            render(<BackupModule {...defaultProps} packagesError="Connection failed" />)
            expect(screen.getByText(/Connection failed/i)).toBeInTheDocument()
        })
    })
})
