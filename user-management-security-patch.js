// Security patch for user-management.html
// This file contains the security fixes to be applied

// 1. Update auth check to allow accountant
const authCheckFix = `
        // Check auth
        let currentUserRole = '';
        let currentUserId = '';
        
        auth.onAuthStateChanged(async (user) => {
            if (!user) {
                window.location.href = 'index.html';
                return;
            }

            currentUserRole = localStorage.getItem('userRole');
            currentUserId = user.uid;
            
            if (currentUserRole !== 'admin' && currentUserRole !== 'accountant') {
                alert('هذه الصفحة متاحة للمدير والمحاسب فقط');
                window.location.href = 'index.html';
                return;
            }

            await loadUsers();
        });
`;

// 2. Add permission check function
const permissionCheckFunction = `
        // Check if current user can modify target user
        function canModifyUser(targetUserRole) {
            // Admin can modify anyone
            if (currentUserRole === 'admin') {
                return true;
            }
            
            // Accountant can only modify drivers and themselves
            if (currentUserRole === 'accountant') {
                return targetUserRole === 'driver';
            }
            
            return false;
        }
`;

// 3. Update openEditModal with permission check
const editModalFix = `
        // Edit modal functions
        function openEditModal(userId) {
            const user = users.find(u => u.id === userId);
            if (!user) return;

            // Check permissions
            if (!canModifyUser(user.role)) {
                showMessage('ليس لديك صلاحية لتعديل هذا المستخدم', 'error');
                return;
            }

            document.getElementById('editUserId').value = user.id;
            document.getElementById('editUserName').value = user.name || '';
            document.getElementById('editUserRole').value = user.role;
            
            document.getElementById('editModal').style.display = 'block';
        }
`;

// 4. Update toggleUserStatus with permission check
const toggleStatusFix = `
        // Toggle user status
        async function toggleUserStatus(userId, isActive) {
            const user = users.find(u => u.id === userId);
            if (!user) return;
            
            // Check permissions
            if (!canModifyUser(user.role)) {
                showMessage('ليس لديك صلاحية لتعطيل/تفعيل هذا المستخدم', 'error');
                return;
            }
            
            const action = isActive ? 'تفعيل' : 'تعطيل';
            
            if (!confirm(\`هل أنت متأكد من \${action} هذا المستخدم؟\`)) return;

            try {
                await db.collection('users').doc(userId).update({
                    isActive: isActive,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                showMessage(\`تم \${action} المستخدم بنجاح! ✅\`, 'success');
                await loadUsers();
                
            } catch (error) {
                console.error('Error toggling user status:', error);
                showMessage(\`حدث خطأ في \${action} المستخدم\`, 'error');
            }
        }
`;

// 5. Update deleteUser with permission check
const deleteUserFix = `
        // Delete user
        async function deleteUser(userId) {
            const user = users.find(u => u.id === userId);
            if (!user) return;
            
            // Check permissions
            if (!canModifyUser(user.role)) {
                showMessage('ليس لديك صلاحية لحذف هذا المستخدم', 'error');
                return;
            }
            
            if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟ هذا الإجراء لا يمكن التراجع عنه!')) return;

            try {
                await db.collection('users').doc(userId).delete();
                showMessage('تم حذف المستخدم بنجاح! ✅', 'success');
                await loadUsers();
                
            } catch (error) {
                console.error('Error deleting user:', error);
                showMessage('حدث خطأ في حذف المستخدم', 'error');
            }
        }
`;

console.log('Security patches defined');
