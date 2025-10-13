/**
 * Merchants Management Script
 */

let currentPage = 1;
let merchants = [];

// Check auth on load
if (!requireAuth()) {
    window.location.href = '/login';
}

// Load user info
const user = getUser();
if (!user || user.role !== 'admin') {
    alert('Unauthorized access');
    window.location.href = '/dashboard';
}

document.getElementById('userName').textContent = user.username || user.email;

// Logout handler
document.getElementById('logoutBtn').addEventListener('click', (e) => {
    e.preventDefault();
    logout();
});

// Load merchants on page load
loadMerchants();

/**
 * Load merchants from API
 */
async function loadMerchants() {
    try {
        const response = await apiRequest('/dashboard/merchants');

        if (response.success) {
            merchants = response.merchants || [];
            updateStats();
            renderMerchants();
        }
    } catch (error) {
        console.error('Failed to load merchants:', error);
        showToast('Failed to load merchants', 'error');
    }
}

/**
 * Update stats
 */
function updateStats() {
    const totalMerchants = merchants.length;
    const activeMerchants = merchants.filter(m => m.status === 'active').length;

    document.getElementById('totalMerchants').textContent = totalMerchants;
    document.getElementById('activeMerchants').textContent = activeMerchants;
    document.getElementById('totalClicks').textContent = '0';
    document.getElementById('totalCommission').textContent = '0đ';
}

/**
 * Render merchants table
 */
function renderMerchants() {
    const tbody = document.getElementById('merchantsTable');
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    // Filter merchants
    const filtered = merchants.filter(m =>
        m.name.toLowerCase().includes(searchTerm) ||
        m.domain.toLowerCase().includes(searchTerm)
    );

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

    const itemsPerPage = 20;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageItems = filtered.slice(startIndex, endIndex);

    tbody.innerHTML = pageItems.map(merchant => `
        <tr>
            <td>
                <img src="${merchant.logo_url || 'https://via.placeholder.com/50'}"
                     alt="${merchant.name}"
                     style="width: 50px; height: 50px; object-fit: contain; border-radius: 8px;">
            </td>
            <td>
                <strong>${merchant.name}</strong>
            </td>
            <td>
                <a href="https://${merchant.domain}" target="_blank" style="color: var(--primary);">
                    ${merchant.domain}
                </a>
            </td>
            <td>
                <span class="badge badge-success">
                    ${merchant.commission_rate || 'N/A'}
                </span>
            </td>
            <td>
                <span class="badge badge-${merchant.status === 'active' ? 'success' : 'secondary'}">
                    ${merchant.status || 'active'}
                </span>
            </td>
            <td>0</td>
            <td>0</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="editMerchant(${merchant.id})">
                    Edit
                </button>
            </td>
        </tr>
    `).join('');

    updatePagination(filtered.length, itemsPerPage);
}

/**
 * Update pagination
 */
function updatePagination(totalItems, itemsPerPage) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;

    document.getElementById('prevBtn').disabled = currentPage === 1;
    document.getElementById('nextBtn').disabled = currentPage === totalPages;
}

/**
 * Edit merchant
 */
function editMerchant(merchantId) {
    const merchant = merchants.find(m => m.id === merchantId);
    if (!merchant) return;

    document.getElementById('merchantId').value = merchant.id;
    document.getElementById('merchantName').value = merchant.name;
    document.getElementById('commissionRate').value = merchant.commission_rate || '';
    document.getElementById('merchantStatus').value = merchant.status || 'active';

    document.getElementById('editModal').classList.add('show');
}

/**
 * Sync merchants from AccessTrade
 */
async function syncMerchants() {
    const btn = document.getElementById('syncMerchantsBtn');
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Syncing...';

    try {
        const response = await apiRequest('/admin/sync-merchants', {
            method: 'POST'
        });

        if (response.success) {
            showToast('Merchants synced successfully', 'success');
            await loadMerchants();
        } else {
            throw new Error(response.message);
        }
    } catch (error) {
        console.error('Sync failed:', error);
        showToast('Failed to sync merchants: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>🔄</span> Sync Merchants from AccessTrade';
    }
}

// Event Listeners
document.getElementById('syncMerchantsBtn').addEventListener('click', syncMerchants);

document.getElementById('searchInput').addEventListener('input', () => {
    currentPage = 1;
    renderMerchants();
});

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
    document.getElementById('editModal').classList.remove('show');
});

document.getElementById('cancelBtn').addEventListener('click', () => {
    document.getElementById('editModal').classList.remove('show');
});

document.getElementById('editMerchantForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const merchantId = document.getElementById('merchantId').value;
    const commissionRate = document.getElementById('commissionRate').value;
    const status = document.getElementById('merchantStatus').value;

    try {
        const response = await apiRequest(`/admin/merchants/${merchantId}`, {
            method: 'PUT',
            body: JSON.stringify({
                commission_rate: commissionRate,
                status: status
            })
        });

        if (response.success) {
            showToast('Merchant updated successfully', 'success');
            document.getElementById('editModal').classList.remove('show');
            await loadMerchants();
        } else {
            throw new Error(response.message);
        }
    } catch (error) {
        console.error('Update failed:', error);
        showToast('Failed to update merchant: ' + error.message, 'error');
    }
});
