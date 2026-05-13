import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, setDoc, doc, updateDoc, deleteDoc, serverTimestamp, onSnapshot, orderBy } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { signInAnonymously } from 'firebase/auth';
import { 
  Users, 
  UserPlus, 
  ArrowLeft, 
  Plus,
  X,
  Loader2,
  KeyRound,
  User as UserIcon,
  ShieldCheck,
  Search,
  School,
  Pencil,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AdminAccount {
  id: string;
  email: string;
  password?: string;
  schoolName: string;
  createdAt: any;
}

interface Props {
  onBack: () => void;
}

export default function AdminManagementDashboard({ onBack }: Props) {
  const [adminList, setAdminList] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [activeTab, setActiveTab] = useState<'admins' | 'reports'>('admins');
  const [reports, setReports] = useState<any[]>([]);
  const [reportSearch, setReportSearch] = useState('');
  const [schoolMap, setSchoolMap] = useState<Record<string, string>>({});
  
  // New Admin Form
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Edit Admin state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminAccount | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [confirmEditPassword, setConfirmEditPassword] = useState('');

  useEffect(() => {
    const init = async () => {
      try {
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth init failed", err);
      }
    };
    init();

    const q = query(collection(db, 'admin_accounts'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const admins = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AdminAccount[];
      setAdminList(admins);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'admin_accounts');
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (activeTab !== 'reports') return;

    // Use current adminList to build the map
    const map: Record<string, string> = {};
    adminList.forEach(a => {
      // Map based on various potential ID mappings
      map[a.id] = a.schoolName;
      // Also map instance IDs if they were stored differently
      // In AdminDashboard, staff get an instanceId. We should ensure admins have one too.
    });
    setSchoolMap(map);

    const q = query(collection(db, 'attendance'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setReports(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'attendance');
    });

    return () => unsubscribe();
  }, [activeTab, adminList]);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    setSaving(true);
    setError(null);
    try {
      const newAdminRef = doc(collection(db, 'admin_accounts'));
      const adminId = newAdminRef.id;
      await setDoc(newAdminRef, {
        schoolName: newSchoolName.trim(),
        email: newEmail.trim(),
        password: newPassword.trim(),
        instanceId: adminId, // Use the new doc ID as the institutional instance ID
        createdAt: serverTimestamp(),
      });
      
      setIsModalOpen(false);
      setNewSchoolName('');
      setNewEmail('');
      setNewPassword('');
      setConfirmPassword('');
      alert('Admin Profile Created Successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to create admin');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAdmin = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'admin_accounts', id));
      setDeleteConfirmId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `admin_accounts/${id}`);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdmin) return;
    
    if (editPassword !== confirmEditPassword) {
      setError('Passwords do not match');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateDoc(doc(db, 'admin_accounts', editingAdmin.id), {
        password: editPassword.trim()
      });
      
      setIsEditModalOpen(false);
      setEditingAdmin(null);
      setEditPassword('');
      setConfirmEditPassword('');
      alert('Password Updated Successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  const filteredAdmins = adminList.filter(a => 
    a.schoolName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredReports = reports.filter(r => 
    r.studentName?.toLowerCase().includes(reportSearch.toLowerCase()) ||
    r.studentId?.toLowerCase().includes(reportSearch.toLowerCase()) ||
    r.status?.toLowerCase().includes(reportSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors group"
          >
            <ArrowLeft className="text-gray-500 group-hover:text-indigo-600" />
          </button>
          <div className="p-2 bg-purple-600 text-white rounded-xl shadow-lg shadow-purple-100">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h1 className="font-bold text-xl text-gray-900 tracking-tight">Admin Management</h1>
            <p className="text-xs text-gray-500 font-medium">Master Profile Dashboard</p>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6 text-left">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              {activeTab === 'admins' ? 'Institution Profiles' : 'Attendance Reports'}
            </h2>
            <p className="text-gray-500 mt-1">
              {activeTab === 'admins' 
                ? 'Manage and monitor all school administrator accounts' 
                : 'Centralized institutional logs for all scans and manual marks'}
            </p>
          </div>
          {activeTab === 'admins' && (
            <button
              onClick={() => {
                setError(null);
                setIsModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-2xl hover:bg-purple-700 shadow-xl shadow-purple-200 transition-all font-bold group"
            >
              <UserPlus size={20} className="group-hover:scale-110 transition-transform" />
              Create Admin Profile
            </button>
          )}
        </header>

        {/* Tabs */}
        <div className="flex gap-4 border-b border-gray-100">
          <button 
            onClick={() => setActiveTab('admins')}
            className={`pb-4 px-4 font-bold transition-all relative ${activeTab === 'admins' ? 'text-purple-600' : 'text-gray-400'}`}
          >
            Admins
            {activeTab === 'admins' && <motion.div layoutId="admintab" className="absolute bottom-0 left-0 right-0 h-1 bg-purple-600 rounded-full" />}
          </button>
          <button 
            onClick={() => setActiveTab('reports')}
            className={`pb-4 px-4 font-bold transition-all relative ${activeTab === 'reports' ? 'text-purple-600' : 'text-gray-400'}`}
          >
            Reports
            {activeTab === 'reports' && <motion.div layoutId="admintab" className="absolute bottom-0 left-0 right-0 h-1 bg-purple-600 rounded-full" />}
          </button>
        </div>

        {/* Stats & Search */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-1 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-center">
            <span className="text-gray-400 text-sm font-medium">
              {activeTab === 'admins' ? 'Institution Profiles' : 'Total Logs'}
            </span>
            <span className="text-4xl font-black text-gray-900 mt-1">
              {activeTab === 'admins' ? adminList.length : reports.length}
            </span>
          </div>
          <div className="md:col-span-3 bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center px-6 gap-4">
            <Search className="text-gray-400" size={24} />
            <input
              type="text"
              placeholder={activeTab === 'admins' ? "Search by school or email..." : "Search by student, register no, or status..."}
              className="flex-1 bg-transparent border-none focus:ring-0 text-gray-900 text-lg placeholder:text-gray-300"
              value={activeTab === 'admins' ? searchTerm : reportSearch}
              onChange={(e) => activeTab === 'admins' ? setSearchTerm(e.target.value) : setReportSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden min-h-[500px]">
          {loading && activeTab === 'admins' ? (
            <div className="p-20 flex flex-col items-center justify-center text-gray-400 gap-4">
              <Loader2 className="animate-spin text-purple-600" size={40} />
              <p className="font-medium">Loading admin records...</p>
            </div>
          ) : activeTab === 'admins' ? (
            // Admin Table
            filteredAdmins.length === 0 ? (
              <div className="p-20 flex flex-col items-center justify-center text-gray-400 gap-4 text-center">
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center">
                  <Users size={40} />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">No admins found</p>
                  <p className="text-sm">Start by creating the first admin profile</p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold tracking-wider">
                    <tr>
                      <th className="px-8 py-4">School/College</th>
                      <th className="px-8 py-4">Admin Email</th>
                      <th className="px-8 py-4">Login Password</th>
                      <th className="px-8 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    <AnimatePresence>
                      {filteredAdmins.map((admin) => (
                        <motion.tr
                          key={admin.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="hover:bg-gray-50 transition-colors group"
                        >
                          <td className="px-8 py-6">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center font-bold">
                                {admin.schoolName?.charAt(0)}
                              </div>
                              <span className="font-bold text-gray-900">{admin.schoolName}</span>
                            </div>
                          </td>
                          <td className="px-8 py-6 text-gray-600 font-medium">
                            {admin.email}
                          </td>
                          <td className="px-8 py-6 font-mono text-sm text-gray-400">
                            {admin.password}
                          </td>
                          <td className="px-8 py-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => {
                                  setEditingAdmin(admin);
                                  setEditPassword('');
                                  setConfirmEditPassword('');
                                  setError(null);
                                  setIsEditModalOpen(true);
                                }}
                                className="p-3 text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                title="Edit Password"
                              >
                                <Pencil size={20} />
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(admin.id)}
                                className="p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                title="Delete Admin"
                              >
                                <X size={20} />
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            )
          ) : (
            // Reports Table
            <div className="overflow-x-auto">
              {filteredReports.length === 0 ? (
                <div className="p-20 flex flex-col items-center justify-center text-gray-400 gap-4 text-center">
                   <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center">
                    <History size={40} />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-900">No attendance reports found</p>
                    <p className="text-sm">Attendance logs will appear here as they are created</p>
                  </div>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold tracking-wider">
                    <tr>
                      <th className="px-8 py-4">Register No</th>
                      <th className="px-8 py-4">Student Name</th>
                      <th className="px-8 py-4">Status</th>
                      <th className="px-8 py-4">Scan/Log Time</th>
                      <th className="px-8 py-4">Institution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    <AnimatePresence>
                      {filteredReports.map((log: any) => (
                        <motion.tr
                          key={log.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-8 py-4 font-mono text-sm">{log.studentId}</td>
                          <td className="px-8 py-4 font-bold text-gray-900">{log.studentName}</td>
                          <td className="px-8 py-4">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${log.status === 'present' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {log.status}
                            </span>
                          </td>
                          <td className="px-8 py-4">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-gray-900">
                                {log.timestamp ? new Date(log.timestamp.toDate()).toLocaleString() : 'N/A'}
                              </span>
                              <span className="text-[10px] text-gray-400 font-bold uppercase">
                                {log.autoGenerated ? 'System Auto-Absent' : log.manuallyMarkedBy ? 'Manual Mark' : 'QR Scan'}
                              </span>
                            </div>
                          </td>
                          <td className="px-8 py-4">
                             <div className="flex flex-col">
                               <span className="text-sm font-bold text-gray-900">
                                 {schoolMap[log.instanceId] || 'Main Office'}
                               </span>
                               <span className="text-[10px] font-mono text-gray-400">
                                 {log.instanceId || 'Legacy'}
                               </span>
                             </div>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Create Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl p-8 overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-purple-100 text-purple-600 rounded-2xl">
                    <UserPlus size={24} />
                  </div>
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight">New Admin Profile</h3>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="text-gray-400" />
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm font-bold rounded-xl text-center">
                  {error}
                </div>
              )}

              <form onSubmit={handleCreateAdmin} className="space-y-6 text-left">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">School/College Name</label>
                  <div className="relative">
                    <School className="absolute left-4 top-4 text-gray-400" size={20} />
                    <input
                      required
                      className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-purple-500 rounded-2xl outline-none font-medium text-gray-900 transition-all"
                      placeholder="Enter institution name..."
                      value={newSchoolName}
                      onChange={(e) => setNewSchoolName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">Admin Email ID</label>
                  <div className="relative">
                    <UserIcon className="absolute left-4 top-4 text-gray-400" size={20} />
                    <input
                      required
                      type="email"
                      className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-purple-500 rounded-2xl outline-none font-medium text-gray-900 transition-all"
                      placeholder="admin@school.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700">New Password</label>
                    <div className="relative">
                      <KeyRound className="absolute left-4 top-4 text-gray-400" size={20} />
                      <input
                        required
                        type="password"
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-purple-500 rounded-2xl outline-none font-medium text-gray-900 transition-all"
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700">Confirm Password</label>
                    <input
                      required
                      type="password"
                      className="w-full px-4 py-4 bg-gray-50 border-2 border-transparent focus:border-purple-500 rounded-2xl outline-none font-medium text-gray-900 transition-all"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    disabled={saving}
                    type="submit"
                    className="w-full py-4 bg-purple-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-purple-100 hover:bg-purple-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="animate-spin" /> : <Plus size={24} />} Save Admin Profile
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Password Modal */}
      <AnimatePresence>
        {isEditModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditModalOpen(false)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl p-8 overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl">
                    <KeyRound size={24} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-gray-900 tracking-tight">Edit Password</h3>
                    <p className="text-xs text-gray-500 font-medium">{editingAdmin?.schoolName}</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="text-gray-400" />
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm font-bold rounded-xl text-center">
                  {error}
                </div>
              )}

              <form onSubmit={handleUpdatePassword} className="space-y-6 text-left">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">New Password</label>
                  <div className="relative">
                    <KeyRound className="absolute left-4 top-4 text-gray-400" size={20} />
                    <input
                      required
                      type="password"
                      className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-medium text-gray-900 transition-all"
                      placeholder="••••••••"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">Confirm New Password</label>
                  <div className="relative">
                    <KeyRound className="absolute left-4 top-4 text-gray-400" size={20} />
                    <input
                      required
                      type="password"
                      className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-medium text-gray-900 transition-all"
                      placeholder="••••••••"
                      value={confirmEditPassword}
                      onChange={(e) => setConfirmEditPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    disabled={saving}
                    type="submit"
                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="animate-spin" /> : <Plus size={24} />} Update Password
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation */}
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirmId(null)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative bg-white w-full max-w-sm rounded-[2rem] shadow-2xl p-8 text-center"
            >
              <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <X size={40} />
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2">Confirm Delete</h3>
              <p className="text-gray-500 mb-8">
                Are you sure you want to delete this admin account? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 px-6 py-4 border-2 border-gray-100 rounded-2xl text-gray-500 font-bold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteConfirmId && handleDeleteAdmin(deleteConfirmId)}
                  className="flex-1 px-6 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
