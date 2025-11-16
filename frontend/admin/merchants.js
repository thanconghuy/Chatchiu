/**
 * Merchants Management Script
 */

let currentPage = 1;
let merchants = [];
let ITEMS_PER_PAGE = 50;

// Check auth on load
if (!requireAuth()) {
    window.location.href = '/login';
}

// Check admin access (async)
(async () => {
    await checkAdminAccess();
    loadMerchants();
})();

/**
 * Check if user is admin
 */
async function checkAdminAccess() {
    try {
        const response = await apiRequest('/auth/me');
        if (response.success && response.user) {
            saveAuth(getToken(), response.user);

            const user = response.user;
            displayUserName('userName');

            if (!user.is_admin) {
                showToast('Access denied: Admin only', 'error');
                setTimeout(() => {
                    window.location.href = '../dashboard.html';
                }, 2000);
                return false;
            }
            return true;
        } else {
            throw new Error('Failed to verify admin status');
        }
    } catch (error) {
        console.error('Admin check error:', error);
        showToast('Access denied: Admin only', 'error');
        setTimeout(() => {
            window.location.href = '../dashboard.html';
        }, 2000);
        return false;
    }
}

// Logout handler
document.getElementById('logoutBtn').addEventListener('click', (e) => {
    e.preventDefault();
    logout();
});

/**
 * Load merchants from API
 */
async function loadMerchants() {
    try {
        const response = await apiRequest('/admin/merchants?activeOnly=false');

        if (response.success) {
            merchants = response.merchants || [];
            console.log('Loaded merchants:', merchants);

            // Log first merchant to see data structure
            if (merchants.length > 0) {
                console.log('First merchant:', merchants[0]);
                console.log('total_clicks:', merchants[0].total_clicks);
                console.log('total_conversions:', merchants[0].total_conversions);
            }

            renderMerchants();
            updateStats();
        }
    } catch (error) {
        console.error('Failed to load merchants:', error);
        showToast('Failed to load merchants', 'error');
    }
}

/**
 * Update statistics cards
 */
function updateStats() {
    // Total merchants
    const totalMerchants = merchants.length;
    document.getElementById('totalMerchants').textContent = totalMerchants.toLocaleString();

    // Active merchants
    const activeMerchants = merchants.filter(m => m.is_active).length;
    document.getElementById('activeMerchants').textContent = activeMerchants.toLocaleString();

    // Total clicks (sum of all merchant clicks)
    const totalClicks = merchants.reduce((sum, m) => sum + (parseInt(m.total_clicks) || 0), 0);
    document.getElementById('totalClicks').textContent = totalClicks.toLocaleString();

    // Total commission (sum of all merchant commissions)
    const totalCommission = merchants.reduce((sum, m) => {
        const commission = parseFloat(m.total_commission) || 0;
        return sum + commission;
    }, 0);
    document.getElementById('totalCommission').textContent = formatCurrency(totalCommission);
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
 * Render merchants table
 */
function renderMerchants() {
    const tbody = document.getElementById('merchantsTable');
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    // Filter merchants
    const filtered = merchants.filter(m => {
        const nameMatch = m.name.toLowerCase().includes(searchTerm);
        const idMatch = m.id.toLowerCase().includes(searchTerm);
        return nameMatch || idMatch;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-state">
                <td colspan="8">
                    <div class="empty-message">
                        <p>No merchants found</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageItems = filtered.slice(startIndex, endIndex);

    tbody.innerHTML = pageItems.map(merchant => {
        const domainUrl = merchant.deep_link_base || '#';
        const domain = domainUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

        return `
        <tr>
            <td>
                <img src="${merchant.logo_url || 'https://via.placeholder.com/50'}"
                     alt="${merchant.name}"
                     style="width: 50px; height: 50px; object-fit: contain; border-radius: 8px; background: #f5f5f5; padding: 4px;">
            </td>
            <td>
                <strong>${merchant.name}</strong><br>
                <small style="color: var(--gray-600);">${merchant.id}</small>
            </td>
            <td>
                ${domainUrl !== '#' ? `<a href="${domainUrl}" target="_blank" style="color: var(--primary);">${domain}</a>` : 'N/A'}
            </td>
            <td>
                <span class="badge badge-success">
                    ${merchant.commission_rate || 'N/A'}
                </span>
            </td>
            <td>
                <span class="badge badge-${merchant.is_active ? 'success' : 'secondary'}">
                    ${merchant.is_active ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td style="text-align: center;">
                <strong>${(merchant.total_clicks || 0).toLocaleString()}</strong>
            </td>
            <td style="text-align: center;">
                <strong>${(merchant.total_conversions || 0).toLocaleString()}</strong>
            </td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="editMerchant('${merchant.id}')">
                    Edit
                </button>
            </td>
        </tr>
    `}).join('');

    updatePagination(filtered.length);
}

/**
 * Update pagination
 */
function updatePagination(totalItems) {
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
    // Show only page number
    document.getElementById('pageInfo').textContent = currentPage;

    document.getElementById('prevBtn').disabled = currentPage === 1;
    document.getElementById('nextBtn').disabled = currentPage >= totalPages;
}

/**
 * Add new merchant
 */
function addMerchant() {
    // Clear form
    document.getElementById('merchantId').value = '';
    document.getElementById('merchantIdInput').value = '';
    document.getElementById('merchantIdInput').disabled = false; // Enable ID input for new merchant
    document.getElementById('merchantIdInput').readOnly = false; // Allow editing ID for new merchant
    document.getElementById('merchantName').value = '';
    document.getElementById('logoUrl').value = '';
    document.getElementById('campaignId').value = '';
    document.getElementById('commissionRate').value = '';
    document.getElementById('deepLinkBase').value = '';
    document.getElementById('policyNote').value = '';
    document.getElementById('merchantStatus').value = 'active';

    // Update modal title
    document.getElementById('modalTitle').textContent = 'Thêm Merchant Mới';
    document.getElementById('isEditMode').value = 'false';

    // Show modal
    const modal = document.getElementById('editModal');
    modal.style.display = 'flex';
    modal.classList.add('show');
}

/**
 * Edit merchant
 */
function editMerchant(merchantId) {
    const merchant = merchants.find(m => m.id === merchantId);
    if (!merchant) return;

    // Populate form
    document.getElementById('merchantId').value = merchant.id;
    document.getElementById('merchantIdInput').value = merchant.id;
    document.getElementById('merchantIdInput').disabled = true; // Disable ID input for editing
    document.getElementById('merchantIdInput').readOnly = true; // Make ID readonly for editing
    document.getElementById('merchantName').value = merchant.name || '';
    document.getElementById('logoUrl').value = merchant.logo_url || '';
    document.getElementById('campaignId').value = merchant.campaign_id || '';
    document.getElementById('commissionRate').value = merchant.commission_rate || '';
    document.getElementById('deepLinkBase').value = merchant.deep_link_base || '';
    document.getElementById('policyNote').value = merchant.policy_note || '';
    document.getElementById('merchantStatus').value = merchant.is_active ? 'active' : 'inactive';

    // Update modal title
    document.getElementById('modalTitle').textContent = 'Chỉnh Sửa Merchant';
    document.getElementById('isEditMode').value = 'true';

    // Show modal
    const modal = document.getElementById('editModal');
    modal.style.display = 'flex';
    modal.classList.add('show');
}

// Event Listeners

// Add merchant button
const addMerchantBtn = document.getElementById('addMerchantBtn');
if (addMerchantBtn) {
    addMerchantBtn.addEventListener('click', addMerchant);
}

const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('input', () => {
        currentPage = 1;
        renderMerchants();
    });
}

const rowsPerPageSelect = document.getElementById('rowsPerPage');
if (rowsPerPageSelect) {
    rowsPerPageSelect.addEventListener('change', () => {
        ITEMS_PER_PAGE = parseInt(rowsPerPageSelect.value);
        currentPage = 1; // Reset to first page
        renderMerchants();
    });
}

document.getElementById('prevBtn').addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        renderMerchants();
    }
});

document.getElementById('nextBtn').addEventListener('click', () => {
    currentPage++;
    renderMerchants();
});

// Modal handlers
document.getElementById('closeModal').addEventListener('click', () => {
    const modal = document.getElementById('editModal');
    modal.style.display = 'none';
    modal.classList.remove('show');
});

document.getElementById('cancelBtn').addEventListener('click', () => {
    const modal = document.getElementById('editModal');
    modal.style.display = 'none';
    modal.classList.remove('show');
});

document.getElementById('editMerchantForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log('Form submitted!');

    const isEditMode = document.getElementById('isEditMode').value === 'true';
    const merchantId = document.getElementById('merchantIdInput').value;
    const merchantName = document.getElementById('merchantName').value;
    const logoUrl = document.getElementById('logoUrl').value;
    const campaignId = document.getElementById('campaignId').value;
    const commissionRate = document.getElementById('commissionRate').value;
    const deepLinkBase = document.getElementById('deepLinkBase').value;
    const policyNote = document.getElementById('policyNote').value;
    const statusValue = document.getElementById('merchantStatus').value;

    console.log('Form data:', {
        isEditMode,
        merchantId,
        merchantName,
        logoUrl,
        campaignId,
        commissionRate,
        deepLinkBase,
        policyNote,
        statusValue
    });

    // Validate
    if (!merchantId || !merchantName) {
        console.log('Validation failed:', { merchantId, merchantName });
        showToast('Merchant ID và Name là bắt buộc', 'error');
        return;
    }

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang lưu...';

    try {
        const merchantData = {
            id: merchantId,
            name: merchantName,
            logo_url: logoUrl || null,
            campaign_id: campaignId || null,
            commission_rate: commissionRate || null,
            deep_link_base: deepLinkBase || null,
            policy_note: policyNote || null,
            is_active: statusValue === 'active'
        };

        console.log('Sending merchant data:', merchantData);

        let response;
        if (isEditMode) {
            // Update existing merchant
            console.log('Updating merchant...');
            response = await apiRequest(`/admin/merchant/${merchantId}`, {
                method: 'PUT',
                body: JSON.stringify(merchantData)
            });
        } else {
            // Create new merchant
            console.log('Creating new merchant...');
            response = await apiRequest('/admin/merchants', {
                method: 'POST',
                body: JSON.stringify(merchantData)
            });
        }

        console.log('API Response:', response);

        if (response.success) {
            showToast(isEditMode ? 'Cập nhật merchant thành công' : 'Thêm merchant mới thành công', 'success');
            const modal = document.getElementById('editModal');
            modal.style.display = 'none';
            modal.classList.remove('show');
            await loadMerchants();
        } else {
            console.error('Response not successful:', response);
            throw new Error(response.message || (isEditMode ? 'Update failed' : 'Create failed'));
        }
    } catch (error) {
        console.error('Save failed:', error);
        showToast('Lỗi: ' + error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Lưu';
    }
});

// Make editMerchant globally accessible for onclick handlers
window.editMerchant = editMerchant;
