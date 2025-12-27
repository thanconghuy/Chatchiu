/**
 * Profile Page Script
 * Handles user profile viewing, editing, and password changes
 */

(function() {
    'use strict';

    // Check authentication
    requireAuth();

    let originalProfileData = {};

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        loadProfile();
        setupEventListeners();
    }

    function setupEventListeners() {
        // Profile form submission
        const profileForm = document.getElementById('profileForm');
        if (profileForm) {
            profileForm.addEventListener('submit', handleProfileSubmit);
        }

        // Cancel edit button
        const cancelEditBtn = document.getElementById('cancelEditBtn');
        if (cancelEditBtn) {
            cancelEditBtn.addEventListener('click', resetProfileForm);
        }

        // Password form submission
        const passwordForm = document.getElementById('passwordForm');
        if (passwordForm) {
            passwordForm.addEventListener('submit', handlePasswordSubmit);
        }

        // Password toggle buttons - CSP-compliant event delegation
        document.addEventListener('click', function(e) {
            const toggleBtn = e.target.closest('[data-action="toggle-password"]');
            if (toggleBtn) {
                handlePasswordToggle(toggleBtn);
            }
        });

        // Tab switching
        const tabButtons = document.querySelectorAll('.profile-tab');
        tabButtons.forEach(button => {
            button.addEventListener('click', function() {
                const tabName = this.getAttribute('data-tab');
                switchTab(tabName);
            });
        });

        // Payment account form handlers
        const addPaymentBtn = document.getElementById('addPaymentAccountBtn');
        if (addPaymentBtn) {
            addPaymentBtn.addEventListener('click', showPaymentForm);
        }

        const cancelPaymentBtn = document.getElementById('cancelPaymentBtn');
        if (cancelPaymentBtn) {
            cancelPaymentBtn.addEventListener('click', hidePaymentForm);
        }

        const paymentForm = document.getElementById('paymentForm');
        if (paymentForm) {
            paymentForm.addEventListener('submit', handlePaymentSubmit);
        }

        // Account type change handler - show/hide bank fields
        // Use event delegation to handle dynamically shown form
        document.addEventListener('change', function(e) {
            if (e.target && e.target.id === 'accountType') {
                console.log('📝 [Profile] Account type changed to:', e.target.value);

                const bankNameGroup = document.getElementById('bankNameGroup');
                const bankBranchGroup = document.getElementById('bankBranchGroup');
                const bankName = document.getElementById('bankName');

                if (e.target.value === 'bank') {
                    console.log('🏦 [Profile] Showing bank fields');
                    if (bankNameGroup && bankBranchGroup && bankName) {
                        bankNameGroup.style.display = 'block';
                        bankBranchGroup.style.display = 'block';
                        bankName.required = true;
                    }
                } else {
                    console.log('💳 [Profile] Hiding bank fields for:', e.target.value);
                    if (bankNameGroup && bankBranchGroup && bankName) {
                        bankNameGroup.style.display = 'none';
                        bankBranchGroup.style.display = 'none';
                        bankName.required = false;
                    }
                }
            }
        });
    }

    /**
     * Load user profile data from API
     */
    async function loadProfile() {
        try {
            const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
            if (!token) {
                window.location.href = '/login';
                return;
            }

            const response = await fetch(`${CONFIG.API_BASE_URL}/user/profile`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    // Token expired or invalid
                    localStorage.removeItem(CONFIG.STORAGE_KEYS.TOKEN);
                    window.location.href = '/login';
                    return;
                }
                throw new Error('Failed to load profile');
            }

            const data = await response.json();
            if (data.success) {
                displayProfile(data.profile);
                originalProfileData = { ...data.profile };
            } else {
                throw new Error(data.message || 'Failed to load profile');
            }
        } catch (error) {
            console.error('Error loading profile:', error);
            showAlert('profileAlert', 'error', 'Không thể tải thông tin hồ sơ. Vui lòng thử lại.');
        }
    }

    /**
     * Display profile data in the UI
     */
    function displayProfile(profile) {
        console.log('[Profile] Display profile data:', profile);
        console.log('[Profile] isAdmin check:', profile.isAdmin, profile.is_admin);

        // Header section
        const displayFullName = document.getElementById('displayFullName');
        const displayEmail = document.getElementById('displayEmail');
        const avatarInitial = document.getElementById('avatarInitial');
        const profileAvatar = document.getElementById('profileAvatar');

        if (displayFullName) displayFullName.textContent = profile.fullName || 'Chưa cập nhật';
        if (displayEmail) displayEmail.textContent = profile.email || '';

        // Set avatar
        if (profile.profilePicture) {
            if (avatarInitial) avatarInitial.style.display = 'none';
            const img = document.createElement('img');
            img.src = profile.profilePicture;
            img.alt = profile.fullName;
            if (profileAvatar) {
                profileAvatar.innerHTML = '';
                profileAvatar.appendChild(img);
            }
        } else {
            // Show initial
            const initial = (profile.fullName || 'U').charAt(0).toUpperCase();
            if (avatarInitial) avatarInitial.textContent = initial;
        }

        // Account type badge - Priority: Admin > Google OAuth > Regular
        const accountType = document.getElementById('accountType');
        const accountBadge = document.getElementById('accountBadge');

        // Check if admin first (highest priority)
        if (profile.isAdmin || profile.is_admin) {
            if (accountType) accountType.textContent = 'Quản trị viên';
            if (accountBadge) {
                accountBadge.innerHTML = '<span>👑</span><span>Quản trị viên</span>';
            }
        } else if (profile.oauthProvider === 'google') {
            // Google OAuth account
            if (accountType) accountType.textContent = 'Tài khoản Google';
            if (accountBadge) {
                accountBadge.innerHTML = '<span>🔐</span><span>Tài khoản Google</span>';
            }
        } else {
            // Regular account
            if (accountType) accountType.textContent = 'Tài khoản thường';
            if (accountBadge) {
                accountBadge.innerHTML = '<span>👤</span><span>Tài khoản thường</span>';
            }
        }

        // Balance section
        const availableBalance = document.getElementById('availableBalance');
        const pendingBalance = document.getElementById('pendingBalance');
        const totalCashback = document.getElementById('totalCashback');

        if (availableBalance) availableBalance.textContent = formatCurrency(profile.availableBalance || 0);
        if (pendingBalance) pendingBalance.textContent = formatCurrency(profile.pendingBalance || 0);
        if (totalCashback) totalCashback.textContent = formatCurrency(profile.totalCashback || 0);

        // Form fields
        const fullNameInput = document.getElementById('fullName');
        const usernameInput = document.getElementById('username');
        const emailInput = document.getElementById('email');
        const phoneInput = document.getElementById('phone');

        if (fullNameInput) fullNameInput.value = profile.fullName || '';
        if (usernameInput) usernameInput.value = profile.username || '';
        if (emailInput) emailInput.value = profile.email || '';
        if (phoneInput) phoneInput.value = profile.phone || '';

        // Show/hide password section based on OAuth status
        const passwordSection = document.getElementById('passwordSection');
        const oauthNotice = document.getElementById('oauthNotice');

        if (profile.oauthProvider === 'google') {
            // OAuth user - hide password section, show notice
            if (passwordSection) passwordSection.style.display = 'none';
            if (oauthNotice) oauthNotice.style.display = 'flex';
        } else {
            // Regular user - show password section, hide notice
            if (passwordSection) passwordSection.style.display = 'block';
            if (oauthNotice) oauthNotice.style.display = 'none';
        }
    }

    /**
     * Handle profile form submission
     */
    async function handleProfileSubmit(e) {
        e.preventDefault();

        const fullName = document.getElementById('fullName').value.trim();
        const phone = document.getElementById('phone').value.trim();

        // Validation
        if (fullName.length < 2 || fullName.length > 255) {
            showAlert('profileAlert', 'error', 'Họ và tên phải từ 2-255 ký tự');
            return;
        }

        if (phone && !/^[0-9]{10,11}$/.test(phone)) {
            showAlert('profileAlert', 'error', 'Số điện thoại phải có 10-11 chữ số');
            return;
        }

        // Check if data changed
        if (fullName === originalProfileData.fullName && phone === (originalProfileData.phone || '')) {
            showAlert('profileAlert', 'error', 'Không có thay đổi nào để lưu');
            return;
        }

        const saveBtn = document.getElementById('saveProfileBtn');
        if (saveBtn) saveBtn.disabled = true;

        try {
            const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
            const response = await fetch(`${CONFIG.API_BASE_URL}/user/profile`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fullName,
                    phone: phone || null
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to update profile');
            }

            if (data.success) {
                showAlert('profileAlert', 'success', 'Cập nhật thông tin thành công!');

                // Update original data
                originalProfileData.fullName = fullName;
                originalProfileData.phone = phone;

                // Update display
                const displayFullName = document.getElementById('displayFullName');
                if (displayFullName) displayFullName.textContent = fullName;

                // Update avatar initial if no picture
                if (!originalProfileData.profilePicture) {
                    const avatarInitial = document.getElementById('avatarInitial');
                    if (avatarInitial) avatarInitial.textContent = fullName.charAt(0).toUpperCase();
                }

                // Update localStorage user data if exists
                const userData = localStorage.getItem(CONFIG.STORAGE_KEYS.USER);
                if (userData) {
                    try {
                        const user = JSON.parse(userData);
                        user.fullName = fullName;
                        localStorage.setItem(CONFIG.STORAGE_KEYS.USER, JSON.stringify(user));
                    } catch (e) {
                        console.error('Failed to update localStorage user data:', e);
                    }
                }
            } else {
                throw new Error(data.message || 'Failed to update profile');
            }
        } catch (error) {
            console.error('Error updating profile:', error);
            showAlert('profileAlert', 'error', error.message || 'Không thể cập nhật thông tin. Vui lòng thử lại.');
        } finally {
            if (saveBtn) saveBtn.disabled = false;
        }
    }

    /**
     * Reset profile form to original data
     */
    function resetProfileForm() {
        const fullNameInput = document.getElementById('fullName');
        const phoneInput = document.getElementById('phone');

        if (fullNameInput) fullNameInput.value = originalProfileData.fullName || '';
        if (phoneInput) phoneInput.value = originalProfileData.phone || '';

        hideAlert('profileAlert');
    }

    /**
     * Handle password change form submission
     */
    async function handlePasswordSubmit(e) {
        e.preventDefault();

        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        // Validation
        if (newPassword.length < 6) {
            showAlert('passwordAlert', 'error', 'Mật khẩu mới phải có ít nhất 6 ký tự');
            return;
        }

        if (newPassword !== confirmPassword) {
            showAlert('passwordAlert', 'error', 'Mật khẩu xác nhận không khớp');
            return;
        }

        if (newPassword === currentPassword) {
            showAlert('passwordAlert', 'error', 'Mật khẩu mới phải khác mật khẩu hiện tại');
            return;
        }

        const changePasswordBtn = document.getElementById('changePasswordBtn');
        if (changePasswordBtn) changePasswordBtn.disabled = true;

        try {
            const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
            const response = await fetch(`${CONFIG.API_BASE_URL}/user/change-password`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    currentPassword,
                    newPassword
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to change password');
            }

            if (data.success) {
                showAlert('passwordAlert', 'success', 'Đổi mật khẩu thành công!');

                // Reset password form
                const passwordForm = document.getElementById('passwordForm');
                if (passwordForm) passwordForm.reset();
            } else {
                throw new Error(data.message || 'Failed to change password');
            }
        } catch (error) {
            console.error('Error changing password:', error);
            showAlert('passwordAlert', 'error', error.message || 'Không thể đổi mật khẩu. Vui lòng thử lại.');
        } finally {
            if (changePasswordBtn) changePasswordBtn.disabled = false;
        }
    }

    /**
     * Show alert message
     */
    function showAlert(alertId, type, message) {
        const alert = document.getElementById(alertId);
        if (!alert) return;

        alert.className = `alert ${type} show`;
        alert.textContent = message;

        // Auto hide after 5 seconds for success messages
        if (type === 'success') {
            setTimeout(() => hideAlert(alertId), 5000);
        }
    }

    /**
     * Hide alert message
     */
    function hideAlert(alertId) {
        const alert = document.getElementById(alertId);
        if (!alert) return;

        alert.classList.remove('show');
    }

    /**
     * Handle password visibility toggle
     */
    function handlePasswordToggle(toggleBtn) {
        const targetId = toggleBtn.getAttribute('data-target');
        const passwordInput = document.getElementById(targetId);
        const iconSpan = toggleBtn.querySelector('.toggle-icon');

        if (!passwordInput || !iconSpan) return;

        // Toggle password visibility
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            iconSpan.textContent = '🙈'; // Closed eye - password is visible
        } else {
            passwordInput.type = 'password';
            iconSpan.textContent = '👁️'; // Open eye - password is hidden
        }
    }

    /**
     * Format currency
     */
    function formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND'
        }).format(amount);
    }

    /**
     * Switch between tabs
     */
    function switchTab(tabName) {
        // Remove active class from all tabs and contents
        document.querySelectorAll('.profile-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        // Add active class to selected tab and content
        const selectedTab = document.querySelector(`[data-tab="${tabName}"]`);
        const selectedContent = document.getElementById(`tab-${tabName}`);

        if (selectedTab) selectedTab.classList.add('active');
        if (selectedContent) selectedContent.classList.add('active');

        // Load payment accounts when switching to payment tab
        if (tabName === 'payment') {
            loadPaymentAccounts();
        }
    }

    /**
     * Load payment accounts from API
     */
    async function loadPaymentAccounts() {
        try {
            const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
            const response = await fetch(`${CONFIG.API_BASE_URL}/user/payment-accounts`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to load payment accounts');
            }

            displayPaymentAccounts(data.data || []);
        } catch (error) {
            console.error('Load payment accounts error:', error);
            showPaymentAlert('error', 'Không thể tải danh sách tài khoản thanh toán');
        }
    }

    /**
     * Display payment accounts list
     */
    function displayPaymentAccounts(accounts) {
        const container = document.getElementById('paymentAccountsList');
        if (!container) return;

        if (accounts.length === 0) {
            container.innerHTML = `
                <div class="empty-payment-state">
                    <div class="icon">💳</div>
                    <h3>Chưa có tài khoản thanh toán</h3>
                    <p>Thêm tài khoản thanh toán để nhận tiền cashback</p>
                </div>
            `;
            return;
        }

        container.innerHTML = accounts.map(account => {
            const accountTypeIcons = {
                'bank': '🏦',
                'momo': '📱',
                'zalopay': '💰',
                'other': '💳'
            };

            const accountTypeNames = {
                'bank': 'Ngân hàng',
                'momo': 'Momo',
                'zalopay': 'ZaloPay',
                'other': 'Khác'
            };

            return `
                <div class="payment-account-card">
                    <div class="payment-account-header">
                        <div class="payment-account-type">
                            <span class="icon">${accountTypeIcons[account.account_type] || '💳'}</span>
                            <span>${accountTypeNames[account.account_type] || account.account_type}</span>
                        </div>
                        <div class="payment-status ${account.is_verified ? 'verified' : 'unverified'}">
                            ${account.is_verified ? '✓ Đã xác minh' : '⏳ Chưa xác minh'}
                        </div>
                    </div>
                    <div class="payment-account-info" data-account-id="${account.id}">
                        <div class="payment-info-row">
                            <span class="payment-info-label">Tên chủ tài khoản</span>
                            <span class="payment-info-value account-name-full" style="text-transform: uppercase; font-weight: 600;">⏳ Đang tải...</span>
                        </div>
                        <div class="payment-info-row">
                            <span class="payment-info-label">Số tài khoản</span>
                            <span class="payment-info-value account-number-full" style="font-family: monospace; font-weight: 600;">⏳ Đang tải...</span>
                        </div>
                        ${account.bank_name ? `
                            <div class="payment-info-row">
                                <span class="payment-info-label">Ngân hàng</span>
                                <span class="payment-info-value">${account.bank_name}</span>
                            </div>
                        ` : ''}
                        ${account.bank_branch ? `
                            <div class="payment-info-row">
                                <span class="payment-info-label">Chi nhánh</span>
                                <span class="payment-info-value">${account.bank_branch}</span>
                            </div>
                        ` : ''}
                        <div class="payment-info-row">
                            <span class="payment-info-label">Trạng thái</span>
                            <span class="payment-info-value">
                                ${account.is_default ? '<strong>⭐ Mặc định</strong>' : 'Phụ'}
                            </span>
                        </div>
                    </div>
                    <div class="form-actions" style="margin-top: 16px;">
                        ${!account.is_default ? `
                            <button type="button" class="btn btn-secondary" data-action="set-default" data-id="${account.id}">
                                Đặt làm mặc định
                            </button>
                        ` : ''}
                        <button type="button" class="btn btn-secondary" data-action="delete-payment" data-id="${account.id}">
                            Xóa
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Add event listeners for action buttons
        container.querySelectorAll('[data-action="set-default"]').forEach(btn => {
            btn.addEventListener('click', function() {
                setDefaultPaymentAccount(this.getAttribute('data-id'));
            });
        });

        container.querySelectorAll('[data-action="delete-payment"]').forEach(btn => {
            btn.addEventListener('click', function() {
                deletePaymentAccount(this.getAttribute('data-id'));
            });
        });

        // Auto-load decrypted data for all accounts using Promise.all
        console.log('🔐 [Profile] Loading decrypted data for', accounts.length, 'accounts');

        const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
        console.log('🔑 [Profile] Token exists:', !!token);

        // Use Promise.all to wait for all async operations
        Promise.all(accounts.map(async account => {
            try {
                console.log('📡 [Profile] Fetching account ID:', account.id);
                const response = await fetch(`${CONFIG.API_BASE_URL}/user/payment-accounts/${account.id}/decrypt`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                const result = await response.json();
                console.log('📦 [Profile] API Response for account', account.id, ':', result);

                if (result.success && result.data) {
                    console.log('✅ [Profile] Decrypted data:', {
                        accountId: account.id,
                        name: result.data.account_holder_name_decrypted,
                        number: result.data.account_number_decrypted
                    });

                    // Update UI
                    const accountInfo = container.querySelector(`.payment-account-info[data-account-id="${account.id}"]`);
                    if (accountInfo) {
                        const nameSpan = accountInfo.querySelector('.account-name-full');
                        const numberSpan = accountInfo.querySelector('.account-number-full');

                        if (nameSpan) {
                            const newName = result.data.account_holder_name_decrypted || result.data.account_holder_name;
                            nameSpan.textContent = newName;
                            console.log('✅ Updated name for account', account.id, ':', newName);
                        } else {
                            console.error('❌ Name span not found for account:', account.id);
                        }

                        if (numberSpan) {
                            const newNumber = result.data.account_number_decrypted || result.data.account_number;
                            numberSpan.textContent = newNumber;
                            console.log('✅ Updated number for account', account.id, ':', newNumber);
                        } else {
                            console.error('❌ Number span not found for account:', account.id);
                        }
                    } else {
                        console.error('❌ [Profile] Element not found for account:', account.id);
                    }
                } else {
                    console.error('❌ [Profile] API failed for account', account.id, ':', result);
                    // Fallback to masked data
                    const accountInfo = container.querySelector(`.payment-account-info[data-account-id="${account.id}"]`);
                    if (accountInfo) {
                        const nameSpan = accountInfo.querySelector('.account-name-full');
                        const numberSpan = accountInfo.querySelector('.account-number-full');
                        if (nameSpan) nameSpan.textContent = account.account_holder_name;
                        if (numberSpan) numberSpan.textContent = account.account_number;
                    }
                }
            } catch (error) {
                console.error('❌ [Profile] Fetch error for account', account.id, ':', error);
                // Fallback to masked data
                const accountInfo = container.querySelector(`.payment-account-info[data-account-id="${account.id}"]`);
                if (accountInfo) {
                    const nameSpan = accountInfo.querySelector('.account-name-full');
                    const numberSpan = accountInfo.querySelector('.account-number-full');
                    if (nameSpan) nameSpan.textContent = account.account_holder_name;
                    if (numberSpan) numberSpan.textContent = account.account_number;
                }
            }
        })).then(() => {
            console.log('✅ [Profile] All accounts decrypted and updated');
        }).catch(err => {
            console.error('❌ [Profile] Promise.all error:', err);
        });
    }

    /**
     * Show payment account form
     */
    function showPaymentForm() {
        const accountTypeSelect = document.getElementById('accountType');
        const bankNameGroup = document.getElementById('bankNameGroup');
        const bankBranchGroup = document.getElementById('bankBranchGroup');
        const bankName = document.getElementById('bankName');

        document.getElementById('paymentAccountForm').style.display = 'block';
        document.getElementById('addPaymentAccountBtn').style.display = 'none';
        document.getElementById('paymentForm').reset();

        // After reset, manually set accountType to 'bank' as default
        if (accountTypeSelect) {
            accountTypeSelect.value = 'bank';
            console.log('📋 [Profile] Set accountType to:', accountTypeSelect.value);
        }

        // Directly show bank fields (don't rely on event)
        if (bankNameGroup && bankBranchGroup && bankName) {
            console.log('📋 [Profile] Showing bank fields directly');
            bankNameGroup.style.display = 'block';
            bankBranchGroup.style.display = 'block';
            bankName.required = true;
        }

        console.log('📋 [Profile] Payment form shown and reset');
    }

    /**
     * Hide payment account form
     */
    function hidePaymentForm() {
        document.getElementById('paymentAccountForm').style.display = 'none';
        document.getElementById('addPaymentAccountBtn').style.display = 'block';
        document.getElementById('paymentForm').reset();

        // Reset bank fields visibility
        const bankNameGroup = document.getElementById('bankNameGroup');
        const bankBranchGroup = document.getElementById('bankBranchGroup');
        const bankName = document.getElementById('bankName');

        if (bankNameGroup && bankBranchGroup && bankName) {
            bankNameGroup.style.display = 'none';
            bankBranchGroup.style.display = 'none';
            bankName.required = false;
        }

        console.log('📋 [Profile] Payment form hidden and reset');
    }

    /**
     * Handle payment account form submission
     */
    async function handlePaymentSubmit(e) {
        e.preventDefault();

        const accountType = document.getElementById('accountType').value;
        const accountHolderName = document.getElementById('accountHolderName').value.trim();
        const accountNumber = document.getElementById('accountNumber').value.trim();
        const bankName = document.getElementById('bankName').value.trim();
        const bankBranch = document.getElementById('bankBranch').value.trim();
        const isDefault = document.getElementById('isDefault').checked;

        // Validation
        if (!accountType) {
            showPaymentAlert('error', 'Vui lòng chọn loại tài khoản');
            return;
        }

        if (!accountHolderName || accountHolderName.length < 2) {
            showPaymentAlert('error', 'Tên chủ tài khoản phải có ít nhất 2 ký tự');
            return;
        }

        if (!accountNumber || accountNumber.length < 5) {
            showPaymentAlert('error', 'Số tài khoản không hợp lệ');
            return;
        }

        if (accountType === 'bank' && !bankName) {
            showPaymentAlert('error', 'Vui lòng nhập tên ngân hàng');
            return;
        }

        const saveBtn = document.getElementById('savePaymentBtn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Đang lưu...';

        try {
            const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);

            const payload = {
                accountType,
                accountHolderName,
                accountNumber,
                isDefault
            };

            // Only add bank fields if account type is bank
            if (accountType === 'bank') {
                payload.bankName = bankName;
                if (bankBranch) {
                    payload.bankBranch = bankBranch;
                }
            }

            console.log('Creating payment account with payload:', payload);

            const response = await fetch(`${CONFIG.API_BASE_URL}/user/payment-accounts`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to create payment account');
            }

            showPaymentAlert('success', 'Thêm tài khoản thanh toán thành công!');
            hidePaymentForm();
            loadPaymentAccounts();
        } catch (error) {
            console.error('Create payment account error:', error);
            showPaymentAlert('error', error.message || 'Không thể thêm tài khoản thanh toán');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Lưu tài khoản';
        }
    }

    /**
     * Set payment account as default
     */
    async function setDefaultPaymentAccount(accountId) {
        if (!confirm('Đặt tài khoản này làm mặc định?')) return;

        try {
            const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
            const response = await fetch(`${CONFIG.API_BASE_URL}/user/payment-accounts/${accountId}/set-default`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to set default');
            }

            showPaymentAlert('success', 'Đã đặt làm tài khoản mặc định');
            loadPaymentAccounts();
        } catch (error) {
            console.error('Set default error:', error);
            showPaymentAlert('error', error.message || 'Không thể đặt làm mặc định');
        }
    }

    /**
     * Delete payment account
     */
    async function deletePaymentAccount(accountId) {
        if (!confirm('Bạn có chắc muốn xóa tài khoản thanh toán này?')) return;

        try {
            const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
            const response = await fetch(`${CONFIG.API_BASE_URL}/user/payment-accounts/${accountId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to delete');
            }

            showPaymentAlert('success', 'Đã xóa tài khoản thanh toán');
            loadPaymentAccounts();
        } catch (error) {
            console.error('Delete payment account error:', error);
            showPaymentAlert('error', error.message || 'Không thể xóa tài khoản');
        }
    }

    /**
     * Show payment alert
     */
    function showPaymentAlert(type, message) {
        const alert = document.getElementById('paymentAlert');
        if (!alert) return;

        alert.className = `alert ${type} show`;
        alert.textContent = message;

        // Auto hide after 5 seconds for success messages
        if (type === 'success') {
            setTimeout(() => {
                alert.classList.remove('show');
            }, 5000);
        }
    }
})();
