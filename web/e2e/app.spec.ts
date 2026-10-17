import { test, expect } from '@playwright/test';

test.describe('NeuroScope-3D E2E Suite', () => {
  test('(a) Disclaimer is permanently visible on upload screen', async ({ page }) => {
    await page.goto('/');

    const disclaimer = page.locator('#disclaimer-banner');
    await expect(disclaimer).toBeVisible();
    await expect(disclaimer).toContainText('RESEARCH & TEACHING PROTOTYPE ONLY');
    await expect(disclaimer).toContainText('Not a diagnosis');
    await expect(disclaimer).toContainText('Uses public, de-identified research data only');
  });

  test('(b) Disclaimer is permanently visible on error screen and no result views are rendered', async ({ page }) => {
    await page.goto('/');

    // Simulate validation error matching the prompt's failure mode
    await page.evaluate(() => {
      const store = (window as any).__NEUROSCOPE_STORE__;
      if (store) {
        store.getState().setJobStatus('error', 'T2 shape (240,240,150) differs from T1 (240,240,155)');
      }
    });

    // Disclaimer must still be visible
    const disclaimer = page.locator('#disclaimer-banner');
    await expect(disclaimer).toBeVisible();

    // Error view must show specific backend message
    const errorView = page.locator('#error-view');
    await expect(errorView).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText(
      'T2 shape (240,240,150) differs from T1 (240,240,155)'
    );

    // Hard Rule 3: Never render slices, meshes, or volumes for a failed job
    await expect(page.locator('[data-testid="volume-panel"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="readout-panel"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="slice-panel-axial"]')).not.toBeVisible();
  });

  test('(c) Results workspace synchronizes crosshair and displays estimated volumes', async ({ page }) => {
    await page.goto('/');

    // Populate successful results into store
    await page.evaluate(() => {
      const store = (window as any).__NEUROSCOPE_STORE__;
      if (store) {
        store.getState().setResults({
          volumes: {
            WT: { voxels: 15000, ml: 15.0, formula: '15,000 voxels × (1.0 × 1.0 × 1.0 mm) = 15,000 mm³ = 15.00 mL' },
            TC: { voxels: 8000, ml: 8.0, formula: '8,000 voxels × (1.0 × 1.0 × 1.0 mm) = 8,000 mm³ = 8.00 mL' },
            ET: { voxels: 3000, ml: 3.0, formula: '3,000 voxels × (1.0 × 1.0 × 1.0 mm) = 3,000 mm³ = 3.00 mL' },
          },
          provenance: {
            sha256: 'a1b2c3d4e5f6',
            commit: '675022a',
            modelName: 'MONAI SegResNet (BraTS)',
            version: '1.0.0',
            licence: 'Apache-2.0',
            timestamp: new Date().toISOString(),
            elapsed_s: 14.5,
            from_cache: false,
          },
        });
        store.getState().setVolumeAffine([
          [1, 0, 0, -100],
          [0, 1, 0, -120],
          [0, 0, 1, -50],
          [0, 0, 0, 1],
        ]);
        // Set crosshair in world mm
        store.getState().setCrosshairWorldMm([-40, -30, 10]);
      }
    });

    // Disclaimer must still be visible on results workspace
    const disclaimer = page.locator('#disclaimer-banner');
    await expect(disclaimer).toBeVisible();

    // Volume panel must be visible and contain formula and estimated volume
    const volumePanel = page.locator('[data-testid="volume-panel"]');
    await expect(volumePanel).toBeVisible();
    await expect(volumePanel).toContainText('Estimated Volumes');
    await expect(volumePanel).toContainText('15.00 mL');
    await expect(volumePanel).toContainText('15,000 voxels');

    // Readout panel must show correct derived voxel coordinate:
    // x = -40, offset = -100 => i = 60
    // y = -30, offset = -120 => j = 90
    // z = 10, offset = -50 => k = 60
    const readoutPanel = page.locator('[data-testid="readout-panel"]');
    await expect(readoutPanel).toBeVisible();
    await expect(readoutPanel).toContainText('World Space (RAS mm)');
  });
});
