import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, setDoc, doc, deleteDoc, serverTimestamp, onSnapshot, orderBy, where } from 'firebase/firestore';
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
  User as UserIcon,
  History,
  FileText
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
  const [activeTab, setActiveTab] = useState<'staff' | 'reports'>('staff');
  const [staffList, setStaffList] = useState<StaffRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [reports, setReports] = useState<any[]>([]);
  const [reportSearch, setReportSearch] = useState('');
  
  // New Staff Form
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newStaffId, setNewStaffId] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPass, setNewStaffPass] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

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

  useEffect(() => {
    if (!profile?.instanceId) return;
    
    const hq = query(
      collection(db, 'attendance'), 
      where('instanceId', '==', profile.instanceId),
      orderBy('timestamp', 'desc')
    );
    
    const unsubReports = onSnapshot(hq, (snap) => {
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'attendance');
    });

    return () => unsubReports();
  }, [profile?.instanceId]);

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const docId = newStaffId.trim();
      const instanceId = profile?.instanceId || Math.random().toString(36).substring(2, 12);
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

  const filteredReports = reports.filter(r => 
    r.studentName?.toLowerCase().includes(reportSearch.toLowerCase()) ||
    r.studentId?.toLowerCase().includes(reportSearch.toLowerCase())
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
            <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              {activeTab === 'staff' ? 'Staff Management' : 'Attendance Reports'}
            </h2>
            <p className="text-gray-500 mt-1">
              {activeTab === 'staff' ? 'Create and manage staff credentials' : 'Live attendance logs for your institution'}
            </p>
          </div>
          {activeTab === 'staff' && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 shadow-xl shadow-indigo-200 transition-all font-bold group"
            >
              <UserPlus size={20} className="group-hover:scale-110 transition-transform" />
              Add New Staff
            </button>
          )}
        </header>

        {/* Tabs */}
        <div className="flex gap-4 border-b border-gray-100 mb-6">
          <button 
            onClick={() => setActiveTab('staff')}
            className={`pb-4 px-4 font-bold transition-all relative ${activeTab === 'staff' ? 'text-indigo-600' : 'text-gray-400'}`}
          >
            Staff Accounts
            {activeTab === 'staff' && <motion.div layoutId="admintab" className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-full" />}
          </button>
          <button 
            onClick={() => setActiveTab('reports')}
            className={`pb-4 px-4 font-bold transition-all relative ${activeTab === 'reports' ? 'text-indigo-600' : 'text-gray-400'}`}
          >
            Attendance Logs
            {activeTab === 'reports' && <motion.div layoutId="admintab" className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-full" />}
          </button>
        </div>

        {/* Stats & Search */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-1 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-center">
            <span className="text-gray-400 text-sm font-medium">
              {activeTab === 'staff' ? 'Total Staff' : 'Today\'s Logs'}
            </span>
            <span className="text-4xl font-black text-gray-900 mt-1">
              {activeTab === 'staff' ? staffList.length : reports.length}
            </span>
          </div>
          <div className="md:col-span-3 bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center px-6 gap-4">
            <Search className="text-gray-400" size={24} />
            <input
              type="text"
              placeholder={activeTab === 'staff' ? "Search by name or staff ID..." : "Search students or IDs..."}
              className="flex-1 bg-transparent border-none focus:ring-0 text-gray-900 text-lg placeholder:text-gray-300"
              value={activeTab === 'staff' ? searchTerm : reportSearch}
              onChange={(e) => activeTab === 'staff' ? setSearchTerm(e.target.value) : setReportSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Main Content Area */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden min-h-[400px]">
          {activeTab === 'staff' ? (
            // Staff Table
            <>
              <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <Users size={20} className="text-indigo-600" />
                  Staff Accounts
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
                          <motion.tr key={staff.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-8 py-6">
                               <div className="flex flex-col">
                                 <span className="font-bold text-gray-900">{staff.name}</span>
                                 <span className="text-[10px] text-gray-400 uppercase tracking-widest">Added {staff.createdAt?.toDate ? new Date(staff.createdAt.toDate()).toLocaleDateString() : 'recently'}</span>
                               </div>
                            </td>
                            <td className="px-8 py-6 font-mono text-sm">{staff.staffId}</td>
                            <td className="px-8 py-6">
                               <div className="flex items-center gap-2 text-gray-500 font-mono text-sm">
                                  {visiblePasswords[staff.id] ? staff.password : '••••••••'}
                                  <button 
                                    onClick={() => setVisiblePasswords(prev => ({ ...prev, [staff.id]: !prev[staff.id] }))}
                                    className="hover:text-indigo-600 transition-colors"
                                  >
                                    <KeyRound size={14} className={visiblePasswords[staff.id] ? 'text-indigo-600' : ''} />
                                  </button>
                               </div>
                            </td>
                            <td className="px-8 py-6 text-right">
                              <div className="flex justify-end gap-2 text-gray-300">
                                <button onClick={() => setDeleteConfirmId(staff.id)} className="p-2 hover:text-red-600 transition-colors"><X /></button>
                              </div>
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            // Reports Table
            <>
              <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <History size={20} className="text-indigo-600" />
                  Attendance Reports
                </h3>
              </div>
              <div className="overflow-x-auto">
                {filteredReports.length === 0 ? (
                  <div className="p-20 flex flex-col items-center justify-center text-gray-400 gap-4 text-center">
                     <FileText size={40} />
                     <p className="font-bold text-gray-900">No reports available</p>
                  </div>
                ) : (
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold tracking-wider">
                      <tr>
                        <th className="px-8 py-4">Register No</th>
                        <th className="px-8 py-4">Student Name</th>
                        <th className="px-8 py-4">Status</th>
                        <th className="px-8 py-4">Log Type</th>
                        <th className="px-8 py-4">Time/Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredReports.map((report) => (
                        <tr key={report.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-8 py-4 font-mono text-sm">{report.studentId}</td>
                          <td className="px-8 py-4 font-bold text-gray-900">{report.studentName}</td>
                          <td className="px-8 py-4">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${report.status === 'present' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {report.status}
                            </span>
                          </td>
                          <td className="px-8 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                             {report.autoGenerated ? 'System (Absent)' : report.manuallyMarkedBy ? 'Manual Mark' : 'QR Scan'}
                          </td>
                          <td className="px-8 py-4 text-xs text-gray-500 font-medium">
                            {report.timestamp ? new Date(report.timestamp.seconds * 1000).toLocaleString() : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
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
