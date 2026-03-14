/**
 * CSP Fix - Global Event Delegation
 * Removes all onclick attributes and handles events through delegation
 * to comply with Content Security Policy: script-src-attr 'none'
 */

(function() {
    'use strict';

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        console.log('[CSP Fix] Initializing global event delegation...');

        // Remove all onclick attributes
        removeAllOnclickAttributes();

        // Setup global event delegation
        setupGlobalEventDelegation();

        console.log('[CSP Fix] Initialization complete');
    }

    /**
     * Remove all onclick attributes from the document
     */
    function removeAllOnclickAttributes() {
        const elementsWithOnclick = document.querySelectorAll('[onclick]');
        let count = 0;

        elementsWithOnclick.forEach(element => {
            // Store the onclick value as data attribute before removing
            const onclickValue = element.getAttribute('onclick');
            element.setAttribute('data-onclick', onclickValue);
            element.removeAttribute('onclick');
            count++;
        });

        console.log(`[CSP Fix] Removed ${count} onclick attributes`);
    }

    /**
     * Setup global event delegation for all click events
     */
    function setupGlobalEventDelegation() {
        document.addEventListener('click', handleGlobalClick, true);
        document.addEventListener('change', handleGlobalChange, true);
    }

    /**
     * Global change handler for select/input elements
     */
    function handleGlobalChange(event) {
        const target = event.target;

        // Month filter in auto-sync
        if (target.id === 'waitingListMonthFilter' && typeof window.loadWaitingList === 'function') {
            window.loadWaitingList(target.value);
            return;
        }
    }

    /**
     * Global click handler
     */
    function handleGlobalClick(event) {
        const target = event.target.closest('[data-onclick], button, a, .clickable');
        if (!target) return;

        // Handle data-onclick attributes
        if (target.hasAttribute('data-onclick')) {
            handleDataOnclick(target, event);
            return;
        }

        // Handle common button patterns
        handleCommonPatterns(target, event);
    }

    /**
     * Execute stored onclick code safely
     */
    function handleDataOnclick(element, event) {
        const onclickCode = element.getAttribute('data-onclick');
        if (!onclickCode) return;

        try {
            // Extract function name and parameters
            const match = onclickCode.match(/^(\w+)\((.*)\)$/);
            if (match) {
                const functionName = match[1];
                const params = match[2];

                // Try to find and execute the function
                if (typeof window[functionName] === 'function') {
                    // Parse parameters (simple string/number parsing)
                    const args = params ? parseSimpleArgs(params) : [];
                    window[functionName].apply(null, args);
                    event.preventDefault();
                    event.stopPropagation();
                } else {
                    console.warn(`[CSP Fix] Function not found: ${functionName}`);
                }
            } else {
                console.warn(`[CSP Fix] Cannot parse onclick: ${onclickCode}`);
            }
        } catch (error) {
            console.error('[CSP Fix] Error executing onclick:', error);
        }
    }

    /**
     * Parse simple function arguments from string
     */
    function parseSimpleArgs(paramsString) {
        if (!paramsString.trim()) return [];

        const args = [];
        const params = paramsString.split(',').map(p => p.trim());

        params.forEach(param => {
            // Remove quotes and parse
            if (param.startsWith("'") || param.startsWith('"')) {
                // String parameter
                args.push(param.slice(1, -1));
            } else if (!isNaN(param)) {
                // Number parameter
                args.push(Number(param));
            } else if (param === 'true' || param === 'false') {
                // Boolean parameter
                args.push(param === 'true');
            } else if (param === 'null') {
                args.push(null);
            } else if (param === 'undefined') {
                args.push(undefined);
            } else {
                // Try to evaluate as variable (risky, but needed for some cases)
                try {
                    args.push(eval(param));
                } catch {
                    args.push(param);
                }
            }
        });

        return args;
    }

    /**
     * Handle settings page specific patterns
     */
    function handleSettingsPagePatterns(element, event) {
        // Tab buttons (settings specific)
        if (element.classList.contains('tab-button') && element.dataset.tab) {
            const tabName = element.dataset.tab;
            if (tabName === 'autosync' && typeof window.switchTabWithHistory === 'function') {
                window.switchTabWithHistory(tabName);
            } else if (typeof window.switchTab === 'function') {
                window.switchTab(tabName);
            }
            event.preventDefault();
            return true;
        }

        // Edit buttons in settings
        if (element.classList.contains('btn-edit')) {
            const parent = element.closest('.settings-item, .settings-section');
            if (parent) {
                if (parent.querySelector('#retrySchedule') && typeof window.editRetrySchedule === 'function') {
                    window.editRetrySchedule();
                } else if (parent.querySelector('#apiToken') && typeof window.editApiToken === 'function') {
                    window.editApiToken();
                } else if (parent.querySelector('#apiUrl') && typeof window.editApiUrl === 'function') {
                    window.editApiUrl();
                } else if (parent.querySelector('#commissionSplit') && typeof window.editCommissionSplit === 'function') {
                    window.editCommissionSplit();
                } else if (parent.querySelector('#minWithdrawal') && typeof window.editMinWithdrawal === 'function') {
                    window.editMinWithdrawal();
                } else if (parent.querySelector('#maxWithdrawal') && typeof window.editMaxWithdrawal === 'function') {
                    window.editMaxWithdrawal();
                } else if (parent.querySelector('#processingDays') && typeof window.editProcessingDays === 'function') {
                    window.editProcessingDays();
                } else if (parent.querySelector('#syncSchedule') && typeof window.editSyncSchedule === 'function') {
                    window.editSyncSchedule();
                } else if (parent.querySelector('#syncDays') && typeof window.editSyncDays === 'function') {
                    window.editSyncDays();
                }
                event.preventDefault();
                return true;
            }
        }

        // Test API button
        if (element.classList.contains('btn-test') && typeof window.testAccessTradeAPI === 'function') {
            window.testAccessTradeAPI();
            event.preventDefault();
            return true;
        }

        // Reload cron jobs
        if (element.id === 'reloadCronBtn' && typeof window.reloadCronJobs === 'function') {
            window.reloadCronJobs();
            event.preventDefault();
            return true;
        }

        // Load sync history
        if ((element.textContent.includes('Tải lịch sử') || element.textContent.includes('Làm mới')) && typeof window.loadSyncHistory === 'function') {
            window.loadSyncHistory();
            event.preventDefault();
            return true;
        }

        // View sync details
        if (element.classList.contains('view-sync-detail')) {
            const sessionId = element.dataset.sessionId;
            if (sessionId && typeof window.viewSyncDetails === 'function') {
                window.viewSyncDetails(sessionId);
                event.preventDefault();
                return true;
            }
        }

        // Save buttons in modals
        if (element.classList.contains('btn-save')) {
            const modal = element.closest('.modal');
            if (modal) {
                if (modal.id === 'editRetryScheduleModal' && typeof window.saveRetrySchedule === 'function') {
                    window.saveRetrySchedule();
                } else if (modal.id === 'editApiTokenModal' && typeof window.saveApiToken === 'function') {
                    window.saveApiToken();
                } else if (modal.id === 'editApiUrlModal' && typeof window.saveApiUrl === 'function') {
                    window.saveApiUrl();
                } else if (modal.id === 'editCommissionSplitModal' && typeof window.saveCommissionSplit === 'function') {
                    window.saveCommissionSplit();
                } else if (modal.id === 'editSyncScheduleModal' && typeof window.saveSyncSchedule === 'function') {
                    window.saveSyncSchedule();
                }
                event.preventDefault();
                return true;
            }
        }

        // Save sync days (special case)
        if (element.classList.contains('btn-primary') && element.textContent.includes('Lưu')) {
            const modal = element.closest('.modal');
            if (modal && modal.id === 'editSyncDaysModal' && typeof window.saveSyncDays === 'function') {
                window.saveSyncDays();
                event.preventDefault();
                return true;
            }
        }

        // Cancel buttons
        if (element.classList.contains('btn-secondary') && element.textContent.includes('Hủy')) {
            if (typeof window.closeEditModal === 'function') {
                window.closeEditModal();
                event.preventDefault();
                return true;
            }
        }

        return false;
    }

    /**
     * Handle auto-sync page specific patterns
     */
    function handleAutoSyncPatterns(element, event) {
        // Add to waiting list button
        if (element.id === 'btnAddToWaiting' && typeof window.addToWaitingList === 'function') {
            window.addToWaitingList();
            event.preventDefault();
            return true;
        }

        // Refresh waiting list button
        if (element.id === 'btnRefreshWaiting' && typeof window.loadWaitingList === 'function') {
            window.loadWaitingList();
            event.preventDefault();
            return true;
        }

        // Month filter change
        if (element.id === 'waitingListMonthFilter' && event.type === 'change') {
            const month = element.value;
            if (typeof window.loadWaitingList === 'function') {
                window.loadWaitingList(month);
                event.preventDefault();
                return true;
            }
        }

        return false;
    }

    /**
     * Handle reconciliation table specific patterns
     */
    function handleReconciliationTablePatterns(element, event) {
        // Dropdown toggle button (3 dots)
        if (element.classList.contains('action-dropdown-btn') ||
            element.dataset.action === 'toggle-dropdown') {
            const id = element.dataset.id;
            if (id && typeof window.toggleDropdown === 'function') {
                window.toggleDropdown(id);
                event.preventDefault();
                event.stopPropagation();
                return true;
            }
        }

        // Dropdown menu items
        if (element.classList.contains('action-dropdown-item')) {
            const action = element.dataset.action;
            const id = element.dataset.id;
            const label = element.dataset.label;

            if (action && id && typeof window.handleDropdownAction === 'function') {
                window.handleDropdownAction(action, id, label);
                event.preventDefault();
                event.stopPropagation();
                return true;
            }
        }

        // Legacy table action buttons (kept for backward compatibility)
        if (element.classList.contains('btn-view')) {
            const id = element.dataset.id;
            const label = element.dataset.label;
            if (id && typeof window.viewItems === 'function') {
                window.viewItems(id, label);
                event.preventDefault();
                return true;
            }
        }

        if (element.classList.contains('btn-finalize-table')) {
            const id = element.dataset.id;
            if (id && typeof window.finalizeReconciliation === 'function') {
                window.finalizeReconciliation(id);
                event.preventDefault();
                return true;
            }
        }

        if (element.classList.contains('btn-delete-table')) {
            const id = element.dataset.id;
            if (id && confirm('Bạn có chắc muốn xóa kỳ đối soát này?')) {
                console.warn('Delete reconciliation not implemented:', id);
                event.preventDefault();
                return true;
            }
        }

        if (element.classList.contains('btn-paid-table')) {
            const id = element.dataset.id;
            if (id && typeof window.markAsPaid === 'function') {
                window.markAsPaid(id);
                event.preventDefault();
                return true;
            }
        }

        return false;
    }

    /**
     * Handle common button patterns
     */
    function handleCommonPatterns(element, event) {
        // Reconciliation table specific handlers
        if (handleReconciliationTablePatterns(element, event)) {
            return;
        }

        // Auto-sync page specific handlers
        if (handleAutoSyncPatterns(element, event)) {
            return;
        }

        // Settings page specific handlers
        if (handleSettingsPagePatterns(element, event)) {
            return;
        }

        // Modal close buttons
        if (element.classList.contains('modal-close') ||
            element.classList.contains('close-modal') ||
            (element.textContent === '×' && element.closest('.modal'))) {
            const modal = element.closest('.modal');
            if (modal) {
                if (modal.id === 'orderDetailModal' && typeof window.closeOrderDetailModal === 'function') {
                    window.closeOrderDetailModal();
                } else if (typeof window.closeEditModal === 'function') {
                    window.closeEditModal();
                } else {
                    modal.remove();
                }
                event.preventDefault();
            }
            return;
        }

        // Close buttons
        if (element.classList.contains('btn-close') || element.classList.contains('close-btn')) {
            const modal = element.closest('.modal, .popup, [role="dialog"]');
            if (modal) {
                modal.remove();
                event.preventDefault();
            }
            return;
        }

        // Tab buttons
        if (element.classList.contains('tab-button') || element.classList.contains('tab-btn')) {
            const tabName = element.dataset.tab;
            if (tabName && typeof window.switchTab === 'function') {
                window.switchTab(tabName);
                event.preventDefault();
            }
            return;
        }

        // Action buttons with data-action
        if (element.dataset.action) {
            const action = element.dataset.action;
            if (typeof window[action] === 'function') {
                const args = element.dataset.args ? JSON.parse(element.dataset.args) : [];
                window[action].apply(null, args);
                event.preventDefault();
            }
            return;
        }

        // Edit buttons
        if (element.classList.contains('btn-edit')) {
            handleEditButton(element, event);
            return;
        }

        // Delete buttons
        if (element.classList.contains('btn-delete')) {
            handleDeleteButton(element, event);
            return;
        }

        // View/Detail buttons
        if (element.classList.contains('btn-view') || element.classList.contains('detail-btn')) {
            handleViewButton(element, event);
            return;
        }
    }

    /**
     * Handle edit button clicks
     */
    function handleEditButton(element, event) {
        const id = element.dataset.id || element.closest('tr')?.dataset.id;

        if (typeof window.edit === 'function') {
            window.edit(id);
        } else if (typeof window.editItem === 'function') {
            window.editItem(id);
        } else if (typeof window.showEditModal === 'function') {
            window.showEditModal(id);
        }

        if (id) event.preventDefault();
    }

    /**
     * Handle delete button clicks
     */
    function handleDeleteButton(element, event) {
        const id = element.dataset.id || element.closest('tr')?.dataset.id;

        if (typeof window.deleteItem === 'function') {
            window.deleteItem(id);
        } else if (typeof window.confirmDelete === 'function') {
            window.confirmDelete(id);
        }

        if (id) event.preventDefault();
    }

    /**
     * Handle view/detail button clicks
     */
    function handleViewButton(element, event) {
        const id = element.dataset.id || element.closest('tr')?.dataset.id;

        if (typeof window.viewDetails === 'function') {
            window.viewDetails(id);
        } else if (typeof window.view === 'function') {
            window.view(id);
        } else if (typeof window.showDetails === 'function') {
            window.showDetails(id);
        }

        if (id) event.preventDefault();
    }

    // Observer to handle dynamically added elements
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) { // Element node
                    // Remove onclick from newly added elements
                    if (node.hasAttribute && node.hasAttribute('onclick')) {
                        const onclickValue = node.getAttribute('onclick');
                        node.setAttribute('data-onclick', onclickValue);
                        node.removeAttribute('onclick');
                    }

                    // Remove onclick from children
                    const childrenWithOnclick = node.querySelectorAll?.('[onclick]');
                    childrenWithOnclick?.forEach(child => {
                        const onclickValue = child.getAttribute('onclick');
                        child.setAttribute('data-onclick', onclickValue);
                        child.removeAttribute('onclick');
                    });
                }
            });
        });
    });

    // Start observing
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    console.log('[CSP Fix] MutationObserver started');
})();
