// Copyright (c) 2025-2026 Reid Carlisle <reid.carlisle@iapetustech.co>
// SPDX-License-Identifier: LicenseRef-IapetusTech-Proprietary
// utils.js - utility functions for wormhole-rtc

/**
 * Normalize a wormhole code for cryptographic use.
 * - Lowercase
 * - Trim whitespace
 * - Collapse multiple hyphens to one
 * - Remove leading/trailing hyphens
 * - Remove non-alphanumeric except hyphens (optional, but included for robustness)
 * @param {string} code 
 * @returns {string}
 */
export function normalizeWormholeCode(code) {
    return code
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]+/g, '-') // replace non-alphanum except hyphen with hyphen
        .replace(/-+/g, '-')          // collapse multiple hyphens
        .replace(/^-+|-+$/g, '');     // trim leading/trailing hyphens
}
