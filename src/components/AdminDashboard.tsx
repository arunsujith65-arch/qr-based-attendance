import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, setDoc, doc, deleteDoc, serverTimestamp, onSnapshot, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../AuthContext';
import { 
  Users, 
  UserPlus, 
  LogOut, 
  ShieldCheck, 
  Search,
  Plus,
  X,
  Loader2,
  KeyRound,
  User as UserIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface StaffRegistration {
  id: string;
  staffId: string;
  name: string;
  password?: string;
  createdAt: any;
}

export default function AdminDashboard() {
  const { profile, logout } = useAuth();
  const [staffList, setStaffList] = useState<StaffRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // New Staff Form
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newStaffId, setNewStaffId] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPass, setNewStaffPass] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'staff_registrations'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const staff = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as StaffRegistration[];
      setStaffList(staff);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'staff_registrations');
    });

    return () => unsubscribe();
  }, []);

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const docId = newStaffId.trim();
      const instanceId = Math.random().toString(36).substring(2, 12);
      await setDoc(doc(db, 'staff_registrations', docId), {
        staffId: docId,
        instanceId,
        name: newStaffName,
        password: newStaffPass,
        createdAt: serverTimestamp(),
      });
      setIsModalOpen(false);
      setNewStaffId('');
      setNewStaffName('');
      setNewStaffPass('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'staff_registrations');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStaff = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'staff_registrations', id));
      setDeleteConfirmId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `staff_registrations/${id}`);
    }
  };

  const filteredStaff = staffList.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.staffId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 transition-all duration-300">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h1 className="font-bold text-xl text-gray-900 tracking-tight">Admin Console</h1>
            <p className="text-xs text-gray-500 font-medium">{profile?.name}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
        >
          <LogOut size={18} />
          <span className="font-medium hidden sm:inline">Logout</span>
        </button>
      </nav>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Staff Management</h2>
            <p className="text-gray-500 mt-1">Create and manage staff credentials</p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 shadow-xl shadow-indigo-200 transition-all font-bold group"
          >
            <UserPlus size={20} className="group-hover:scale-110 transition-transform" />
            Add New Staff
          </button>
        </header>

        {/* Stats & Search */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-1 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-center">
            <span className="text-gray-400 text-sm font-medium">Total Staff</span>
            <span className="text-4xl font-black text-gray-900 mt-1">{staffList.length}</span>
          </div>
          <div className="md:col-span-3 bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center px-6 gap-4">
            <Search className="text-gray-400" size={24} />
            <input
              type="text"
              placeholder="Search by name or staff ID..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-gray-900 text-lg placeholder:text-gray-300"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Staff Table/Grid */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-50 flex items-center justify-between">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Users size={20} className="text-indigo-600" />
              Registered Staff Accounts
            </h3>
          </div>
          
          {loading ? (
            <div className="p-20 flex flex-col items-center justify-center text-gray-400 gap-4">
              <Loader2 className="animate-spin text-indigo-600" size={40} />
              <p className="font-medium animate-pulse">Loading staff records...</p>
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="p-20 flex flex-col items-center justify-center text-gray-400 gap-4 text-center">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center">
                <Users size={40} />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">No staff found</p>
                <p className="text-sm">Try a different search or create a new account</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold tracking-wider">
                  <tr>
                    <th className="px-8 py-4">Name</th>
                    <th className="px-8 py-4">Staff ID</th>
                    <th className="px-8 py-4">Password</th>
                    <th className="px-8 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  <AnimatePresence>
                    {filteredStaff.map((staff) => (
                      <motion.tr
                        key={staff.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="hover:bg-gray-50 transition-colors group"
                      >
                        <td className="px-8 py-6 font-bold text-gray-900">{staff.name}</td>
                        <td className="px-8 py-6">
                           <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-sm font-bold">
                             {staff.staffId}
                           </span>
                        </td>
                        <td className="px-8 py-6 font-mono text-sm text-gray-400">
                          {staff.password}
                        </td>
                        <td className="px-8 py-6 text-right">
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(staff.id)}
                            className="p-3 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
                            title="Delete Account"
                          >
                            <X size={20} />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Modal for New Staff */}
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
              className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-8"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl">
                    <UserPlus size={24} />
                  </div>
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight">Add Staff</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
                >
                  <X className="text-gray-400" />
                </button>
              </div>

              <form onSubmit={handleCreateStaff} className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Staff ID (Username)</label>
                  <div className="relative">
                    <UserIcon className="absolute left-4 top-4 text-gray-400" size={20} />
                    <input
                      required
                      type="text"
                      className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl transition-all outline-none text-gray-900 font-medium"
                      placeholder="e.g. S1024"
                      value={newStaffId}
                      onChange={(e) => setNewStaffId(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Full Name</label>
                  <input
                    required
                    type="text"
                    className="w-full px-4 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl transition-all outline-none text-gray-900 font-medium"
                    placeholder="e.g. Dr. John Smith"
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Password</label>
                  <div className="relative">
                    <KeyRound className="absolute left-4 top-4 text-gray-400" size={20} />
                    <input
                      required
                      type="text"
                      className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl transition-all outline-none text-gray-900 font-medium"
                      placeholder="••••••••"
                      value={newStaffPass}
                      onChange={(e) => setNewStaffPass(e.target.value)}
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-4 border-2 border-gray-100 rounded-2xl text-gray-500 font-bold hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={saving}
                    type="submit"
                    className="flex-[2] px-6 py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="animate-spin" /> : <Plus size={24} />} Create Staff
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal for Delete */}
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
                Are you sure you want to delete <span className="font-bold text-gray-900">{staffList.find(s => s.id === deleteConfirmId)?.name}</span>? 
                This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 px-6 py-4 border-2 border-gray-100 rounded-2xl text-gray-500 font-bold hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => deleteConfirmId && handleDeleteStaff(deleteConfirmId)}
                  className="flex-1 px-6 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-100 cursor-pointer"
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
