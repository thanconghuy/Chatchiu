#!/usr/bin/env python3
"""
Script to update all user pages with new sidebar v2
Adds Font Awesome CDN and updates sidebar script reference
"""

import re
from pathlib import Path

# List of user pages to update
USER_PAGES = [
    'shopping.html',
    'statistics.html',
    'history.html',
    'reconciliation-history.html',
    'payment-requests.html',
    'profile.html'
]

FRONTEND_DIR = Path(r'f:\VSCODE\Chatchiu\frontend')

# Font Awesome CDN link
FONT_AWESOME_CDN = '''    <link rel="stylesheet" href="css/user-sidebar.css">
    <!-- Font Awesome for Icons -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA==" crossorigin="anonymous" referrerpolicy="no-referrer" />'''

def update_page(file_path):
    """Update a single HTML page"""
    print(f"Updating {file_path.name}...")

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content

    # 1. Add Font Awesome CDN before </head> if not already present
    if 'font-awesome' not in content.lower():
        content = re.sub(
            r'(\s*</head>)',
            f'\n{FONT_AWESOME_CDN}\n\\1',
            content,
            count=1
        )
        print(f"  [OK] Added Font Awesome CDN")
    else:
        print(f"  [SKIP] Font Awesome already present")

    # 2. Update mobile menu button to use Font Awesome
    if 'mobile-menu-toggle' in content or 'mobile-menu-btn' in content:
        # Update class name
        content = re.sub(
            r'class="mobile-menu-toggle"',
            'class="mobile-menu-btn"',
            content
        )
        # Update button content to use icon
        content = re.sub(
            r'<button class="mobile-menu-btn"[^>]*>☰</button>',
            '<button class="mobile-menu-btn" id="mobileMenuToggle">\n        <i class="fa-solid fa-bars"></i>\n    </button>',
            content
        )
        print(f"  [OK] Updated mobile menu button")

    # 3. Update sidebar comment
    content = re.sub(
        r'<!-- Sidebar will be loaded by user-sidebar\.js -->',
        '<!-- Sidebar will be loaded by user-sidebar-v2.js -->',
        content
    )

    # 4. Update script reference from user-sidebar.js to user-sidebar-v2.js
    if 'user-sidebar.js' in content:
        content = re.sub(
            r'<script src="js/user-sidebar\.js"></script>',
            '<script src="js/user-sidebar-v2.js"></script>',
            content
        )
        print(f"  [OK] Updated sidebar script to v2")
    else:
        print(f"  [SKIP] No sidebar script found")

    # Only write if changes were made
    if content != original_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"  [SUCCESS] {file_path.name} updated successfully\n")
        return True
    else:
        print(f"  [SKIP] No changes needed for {file_path.name}\n")
        return False

def main():
    """Main function"""
    print("=" * 60)
    print("USER SIDEBAR V2 - BATCH UPDATE SCRIPT")
    print("=" * 60)
    print()

    updated_count = 0
    skipped_count = 0

    for page in USER_PAGES:
        file_path = FRONTEND_DIR / page

        if not file_path.exists():
            print(f"[ERROR] {page} not found, skipping...")
            skipped_count += 1
            continue

        if update_page(file_path):
            updated_count += 1
        else:
            skipped_count += 1

    print("=" * 60)
    print(f"SUMMARY:")
    print(f"  [SUCCESS] Updated: {updated_count} files")
    print(f"  [SKIP] Skipped: {skipped_count} files")
    print("=" * 60)

if __name__ == '__main__':
    main()
