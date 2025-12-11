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
})();
