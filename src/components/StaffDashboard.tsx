import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, getDocs, orderBy, setDoc } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { Plus, Users, QrCode, LogOut, Trash2, ChevronRight, X, Loader2, CheckCircle2, School, GraduationCap, KeyRound, User as UserIcon, Eye, EyeOff, Edit2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { signOut } from 'firebase/auth';

interface Class {
  id: string;
  name: string;
  code: string;
  staffId: string;
  department?: string;
}

interface Session {
  id: string;
  classId: string;
  qrCodeData: string;
  status: 'active' | 'ended';
  startTime: any;
  expiryTime: any;
}

interface Attendance {
  id: string;
  studentName: string;
  studentEmail: string;
  timestamp: any;
}

interface StudentAccount {
  id: string;
  registerNo: string;
  password: string;
  name: string;
  lastLoggedInUid?: string;
}

interface StudentPercentage {
  id: string;
  registerNo: string;
  name: string;
  percentage: number;
  totalSessions: number;
  presentCount: number;
  createdAt: any;
}

interface SessionRecord extends Session {
  className?: string;
  classCode?: string;
}

export default function StaffDashboard() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'classes' | 'students' | 'records'>('classes');
  const [classes, setClasses] = useState<Class[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [students, setStudents] = useState<StudentAccount[]>([]);
  const [pastSessions, setPastSessions] = useState<SessionRecord[]>([]);
  const [selectedHistorySession, setSelectedHistorySession] = useState<SessionRecord | null>(null);
  const [historyAttendance, setHistoryAttendance] = useState<Attendance[]>([]);
  const [storedPercentages, setStoredPercentages] = useState<StudentPercentage[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modals
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [isPercentageModalOpen, setIsPercentageModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentAccount | null>(null);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [selectedClassIdForSession, setSelectedClassIdForSession] = useState<string | null>(null);
  
  // Percentage Form
  const [calcRegNo, setCalcRegNo] = useState('');
  const [calcName, setCalcName] = useState('');
  const [calculatedResult, setCalculatedResult] = useState<{
    percentage: number;
    total: number;
    present: number;
  } | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // Class Form
  const [newClassName, setNewClassName] = useState('');
  const [newClassCode, setNewClassCode] = useState('');

  // Student Form
  const [newRegNo, setNewRegNo] = useState('');
  const [newStudentPass, setNewStudentPass] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  // Session Duration
  const [sessionDuration, setSessionDuration] = useState<number>(15); // minutes

  useEffect(() => {
    if (!profile) return;

    const q = query(
      collection(db, 'classes'),
      where('staffId', '==', profile.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const classList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Class));
      setClasses(classList);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  useEffect(() => {
    if (!profile || (activeTab !== 'students' && activeTab !== 'records')) return;

    const q = query(
      collection(db, 'students'),
      where('staffId', '==', profile.uid),
      orderBy('registerNo', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const studentList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StudentAccount));
      setStudents(studentList);
    });

    return () => unsubscribe();
  }, [profile, activeTab]);

  useEffect(() => {
    if (!profile || activeTab !== 'records') return;

    const q = query(
      collection(db, 'sessions'),
      where('staffId', '==', profile.uid),
      where('status', '==', 'ended'),
      orderBy('startTime', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sessions = snapshot.docs.map(doc => {
        const data = doc.data();
        const cls = classes.find(c => c.id === data.classId);
        return { 
          id: doc.id, 
          ...data,
          className: cls?.name || 'Unknown Class',
          classCode: cls?.code || 'N/A'
        } as SessionRecord;
      });
      setPastSessions(sessions);
    });

    return () => unsubscribe();
  }, [profile, activeTab, classes]);

  useEffect(() => {
    if (!selectedHistorySession) {
      setHistoryAttendance([]);
      return;
    }

    const q = query(
      collection(db, 'attendance'),
      where('sessionId', '==', selectedHistorySession.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Attendance));
      setHistoryAttendance(records);
    });

    return () => unsubscribe();
  }, [selectedHistorySession]);

  useEffect(() => {
    if (!profile || activeTab !== 'records') return;

    const q = query(
      collection(db, 'studentPercentages'),
      where('staffId', '==', profile.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StudentPercentage));
      setStoredPercentages(list);
    });

    return () => unsubscribe();
  }, [profile, activeTab]);

  useEffect(() => {
    if (!profile) return;

    const q = query(
      collection(db, 'sessions'),
      where('staffId', '==', profile.uid),
      where('status', '==', 'active')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const session = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Session;
        setActiveSession(session);
      } else {
        setActiveSession(null);
      }
    });

    return () => unsubscribe();
  }, [profile]);

  useEffect(() => {
    if (!activeSession) {
      setAttendance([]);
      return;
    }

    const q = query(
      collection(db, 'attendance'),
      where('sessionId', '==', activeSession.id),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Attendance));
      setAttendance(records);
    });

    return () => unsubscribe();
  }, [activeSession]);

  useEffect(() => {
    if (!activeSession) return;

    const checkExpiry = setInterval(() => {
      if (activeSession.expiryTime) {
        const expiryDate = activeSession.expiryTime.toDate();
        if (new Date() >= expiryDate) {
          endSession();
        }
      }
    }, 5000);

    return () => clearInterval(checkExpiry);
  }, [activeSession]);

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    try {
      await addDoc(collection(db, 'classes'), {
        name: newClassName,
        code: newClassCode,
        staffId: profile.uid,
        createdAt: serverTimestamp(),
      });
      setNewClassName('');
      setNewClassCode('');
      setIsClassModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'classes');
    }
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    try {
      if (editingStudent) {
        // If regNo changed, we need to handle it. For simplicity, we disable regNo editing once created or delete and recreated.
        // But for now, let's just update the existing document.
        await updateDoc(doc(db, 'students', editingStudent.id), {
          password: newStudentPass,
          name: newStudentName,
          updatedAt: serverTimestamp(),
        });
      } else {
        // Scope student ID by staffId to allow multiple staff to have same register numbers
        const scopedId = `${profile.uid}_${newRegNo}`;
        await setDoc(doc(db, 'students', scopedId), {
          registerNo: newRegNo,
          password: newStudentPass,
          name: newStudentName,
          staffId: profile.uid,
          createdAt: serverTimestamp(),
        });
      }
      setNewRegNo('');
      setNewStudentPass('');
      setNewStudentName('');
      setEditingStudent(null);
      setIsStudentModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'students');
    }
  };

  const openStudentModal = (student?: StudentAccount) => {
    if (student) {
      setEditingStudent(student);
      setNewRegNo(student.registerNo);
      setNewStudentPass(student.password);
      setNewStudentName(student.name);
    } else {
      setEditingStudent(null);
      setNewRegNo('');
      setNewStudentPass('');
      setNewStudentName('');
    }
    setIsStudentModalOpen(true);
  };

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const startSession = async () => {
    if (!profile || !selectedClassIdForSession) return;
    
    const durationMs = sessionDuration * 60 * 1000;
    const expiryDate = new Date(Date.now() + durationMs);

    const qrData = JSON.stringify({
       sessionId: Math.random().toString(36).substring(2, 15),
       classId: selectedClassIdForSession,
       timestamp: Date.now(),
       expiry: expiryDate.getTime()
    });

    try {
      await addDoc(collection(db, 'sessions'), {
        classId: selectedClassIdForSession,
        staffId: profile.uid,
        qrCodeData: qrData,
        status: 'active',
        startTime: serverTimestamp(),
        expiryTime: expiryDate,
      });
      setIsSessionModalOpen(false);
      setSelectedClassIdForSession(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'sessions');
    }
  };

  const endSession = async () => {
    if (!activeSession) return;
    try {
      await updateDoc(doc(db, 'sessions', activeSession.id), {
        status: 'ended',
        endTime: serverTimestamp(),
      });
      setActiveSession(null);
      setDeletingId(null);
    } catch (err) {
      console.error("Error ending session:", err);
    }
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteClass = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'classes', id));
      setDeletingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'classes');
    }
  };

  const deleteStudent = async (student: StudentAccount) => {
    try {
      if (student.lastLoggedInUid) {
        try {
          await deleteDoc(doc(db, 'users', student.lastLoggedInUid));
        } catch (e) {
          console.warn("User profile deletion failed or already deleted:", e);
        }
      }
      await deleteDoc(doc(db, 'students', student.id));
      setDeletingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'students');
    }
  };

  const deleteSession = async (id: string) => {
    try {
      if (activeSession?.id === id) {
        alert("Cannot delete an active session. End it first.");
        return;
      }
      await deleteDoc(doc(db, 'sessions', id));
      if (selectedHistorySession?.id === id) {
        setSelectedHistorySession(null);
      }
      setDeletingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'sessions');
    }
  };

  const markStudentPresent = async (student: StudentAccount) => {
    if (!selectedHistorySession || !profile) return;
    try {
      await addDoc(collection(db, 'attendance'), {
        sessionId: selectedHistorySession.id,
        classId: selectedHistorySession.classId,
        staffId: profile.uid,
        studentId: student.registerNo,
        studentName: student.name,
        studentEmail: `${student.registerNo}@manual.local`,
        timestamp: serverTimestamp(),
        manuallyMarkedBy: profile.uid
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'attendance');
    }
  };

  const unmarkStudent = async (student: StudentAccount) => {
    if (!selectedHistorySession) return;
    try {
      const record = historyAttendance.find(a => a.studentId === student.registerNo);
      if (record) {
        await deleteDoc(doc(db, 'attendance', record.id));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'attendance');
    }
  };

  const calculatePercentage = async () => {
    if (!profile || !calcRegNo) return;
    setIsCalculating(true);
    setCalculatedResult(null);

    try {
      // 1. Get all sessions ended by this staff
      const sessionsQ = query(
        collection(db, 'sessions'),
        where('staffId', '==', profile.uid),
        where('status', '==', 'ended')
      );
      const sessionsSnap = await getDocs(sessionsQ);
      const totalSessions = sessionsSnap.size;

      if (totalSessions === 0) {
        alert("No ended sessions found for calculation.");
        setIsCalculating(false);
        return;
      }

      // 2. Count attendance for this student across all these sessions
      const attendanceQ = query(
        collection(db, 'attendance'),
        where('studentId', '==', calcRegNo)
      );
      const attendanceSnap = await getDocs(attendanceQ);
      
      // Filter attendance to ONLY include those in my sessions
      const mySessionIds = sessionsSnap.docs.map(d => d.id);
      const presentCount = attendanceSnap.docs.filter(d => mySessionIds.includes(d.data().sessionId)).length;

      const percentage = (presentCount / totalSessions) * 100;

      setCalculatedResult({
        percentage: Number(percentage.toFixed(2)),
        total: totalSessions,
        present: presentCount
      });
    } catch (err) {
      console.error("Calculation error:", err);
    } finally {
      setIsCalculating(false);
    }
  };

  const savePercentage = async () => {
    if (!profile || !calculatedResult || !calcRegNo || !calcName) return;

    try {
      await addDoc(collection(db, 'studentPercentages'), {
        registerNo: calcRegNo,
        name: calcName,
        percentage: calculatedResult.percentage,
        totalSessions: calculatedResult.total,
        presentCount: calculatedResult.present,
        staffId: profile.uid,
        createdAt: serverTimestamp(),
      });
      setIsPercentageModalOpen(false);
      setCalcRegNo('');
      setCalcName('');
      setCalculatedResult(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'studentPercentages');
    }
  };

  const deletePercentage = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'studentPercentages', id));
      setDeletingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'studentPercentages');
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Staff Portal</h1>
          <p className="text-gray-500">Welcome, {profile?.name}</p>
        </div>
        <button
          onClick={() => signOut(auth)}
          className="flex items-center gap-2 p-2 px-4 text-sm text-gray-600 hover:text-red-600 transition font-medium"
        >
          <LogOut size={16} /> Logout
        </button>
      </header>

      {/* Tabs */}
      <div className="flex gap-4 mb-8 border-b border-gray-100 overflow-x-auto">
         <button 
           onClick={() => setActiveTab('classes')}
           className={`pb-4 px-2 font-bold transition-colors relative whitespace-nowrap ${activeTab === 'classes' ? 'text-indigo-600' : 'text-gray-400'}`}
         >
           Classes
           {activeTab === 'classes' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-full" />}
         </button>
         <button 
           onClick={() => setActiveTab('students')}
           className={`pb-4 px-2 font-bold transition-colors relative whitespace-nowrap ${activeTab === 'students' ? 'text-indigo-600' : 'text-gray-400'}`}
         >
           Manage Students
           {activeTab === 'students' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-full" />}
         </button>
         <button 
           onClick={() => setActiveTab('records')}
           className={`pb-4 px-2 font-bold transition-colors relative whitespace-nowrap ${activeTab === 'records' ? 'text-indigo-600' : 'text-gray-400'}`}
         >
           Attendance Records
           {activeTab === 'records' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-full" />}
         </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {activeTab === 'classes' ? (
            <>
              {/* Existing Classes Content */}
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <School className="text-indigo-600" /> My Classes
                </h2>
                <button
                  onClick={() => setIsClassModalOpen(true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 text-sm shadow-sm"
                >
                  <Plus size={16} /> New Class
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {classes.map((cls) => (
                  <motion.div
                    key={cls.id}
                    layout
                    className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 group"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-lg text-gray-900">{cls.name}</h3>
                        <p className="text-sm text-gray-500">{cls.code}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {deletingId === cls.id ? (
                          <div className="flex gap-2 items-center">
                            <button
                              onClick={() => deleteClass(cls.id)}
                              className="text-[10px] bg-red-600 text-white px-2 py-1 rounded font-bold"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeletingId(null)}
                              className="text-[10px] bg-gray-200 text-gray-600 px-2 py-1 rounded font-bold"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeletingId(cls.id)}
                            className="text-gray-300 hover:text-red-500 transition"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {!activeSession && (
                      <button
                        onClick={() => {
                          setSelectedClassIdForSession(cls.id);
                          setIsSessionModalOpen(true);
                        }}
                        className="w-full mt-4 flex items-center justify-center gap-2 py-2 bg-indigo-50 text-indigo-700 rounded-xl font-medium hover:bg-indigo-100 transition"
                      >
                        <QrCode size={18} /> Start Session
                      </button>
                    )}
                    {activeSession && activeSession.classId === cls.id && (
                      <div className="mt-4 flex items-center justify-center gap-2 py-2 bg-green-50 text-green-700 rounded-xl font-bold animate-pulse">
                         Live Session
                      </div>
                    )}
                    {activeSession && activeSession.classId !== cls.id && (
                      <div className="mt-4 flex items-center justify-center gap-2 py-2 bg-gray-50 text-gray-400 rounded-xl font-medium cursor-not-allowed">
                         Another Session Active
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </>
          ) : activeTab === 'students' ? (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Plus className="text-indigo-600" /> Register Students
                </h2>
                <button
                  onClick={() => openStudentModal()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 text-sm shadow-sm"
                >
                  <Plus size={16} /> Add Student
                </button>
              </div>

              <div className="bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm">
                <table className="w-full text-left">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Register No</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Student Name</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Password</th>
                      <th className="px-6 py-4 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {students.map((stu) => (
                      <tr key={stu.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-mono text-sm">{stu.registerNo}</td>
                        <td className="px-6 py-4 font-bold">{stu.name}</td>
                        <td className="px-6 py-4 font-mono text-sm">
                           <div className="flex items-center gap-2 text-gray-500">
                             {visiblePasswords[stu.id] ? stu.password : '••••••••'}
                             <button 
                               onClick={() => togglePasswordVisibility(stu.id)}
                               className="hover:text-indigo-600 transition-colors"
                             >
                               {visiblePasswords[stu.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                             </button>
                           </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                           <div className="flex justify-end items-center gap-2">
                             <button 
                               onClick={() => openStudentModal(stu)}
                               className="p-2 text-gray-300 hover:text-indigo-600 transition-colors"
                             >
                               <Edit2 size={16} />
                             </button>
                             {deletingId === stu.id ? (
                               <div className="flex gap-2 items-center animate-in fade-in slide-in-from-right-2">
                                 <button
                                   onClick={() => deleteStudent(stu)}
                                   className="text-xs bg-red-600 text-white px-2 py-1 rounded font-bold hover:bg-red-700"
                                 >
                                   Confirm
                                 </button>
                                 <button
                                   onClick={() => setDeletingId(null)}
                                   className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded font-bold"
                                 >
                                   Cancel
                                 </button>
                               </div>
                             ) : (
                               <button 
                                 onClick={() => setDeletingId(stu.id)}
                                 className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                               >
                                 <X size={16} />
                               </button>
                             )}
                           </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {students.length === 0 && (
                   <div className="p-12 text-center text-gray-400">
                     No student accounts managed by you yet.
                   </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
               <div className="flex justify-between items-center">
                 <h2 className="text-xl font-bold flex items-center gap-2">
                    <Users className="text-indigo-600" /> Attendance Records
                 </h2>
                 <button
                   onClick={() => setIsPercentageModalOpen(true)}
                   className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 text-sm shadow-sm"
                 >
                   <GraduationCap size={16} /> Percentage Calculation
                 </button>
               </div>
               
               <div className="space-y-8">
                  <div>
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Past Sessions</h3>
                    <div className="grid grid-cols-1 gap-4">
                      {pastSessions.map((session) => (
                        <div
                          key={session.id}
                          className={`group w-full flex items-stretch rounded-2xl border transition-all ${selectedHistorySession?.id === session.id ? 'border-indigo-600 bg-indigo-50 shadow-md ring-2 ring-indigo-600 ring-opacity-20' : 'border-gray-100 bg-white hover:border-indigo-300'}`}
                        >
                          <button
                            onClick={() => setSelectedHistorySession(session)}
                            className="flex-1 text-left p-6"
                          >
                            <div className="flex justify-between items-center">
                              <div>
                                <h3 className="font-bold text-gray-900">{session.className} ({session.classCode})</h3>
                                <p className="text-sm text-gray-500">
                                  {format(session.startTime?.toDate() || new Date(), 'PPP p')}
                                </p>
                              </div>
                              <ChevronRight className={`transition-transform ${selectedHistorySession?.id === session.id ? 'rotate-90 text-indigo-600' : 'text-gray-300'}`} />
                            </div>
                          </button>
                          
                          <div className="p-4 border-l border-gray-100 flex items-center bg-gray-50/50 rounded-r-2xl">
                            {deletingId === session.id ? (
                              <div className="flex flex-col gap-1">
                                <button
                                  onClick={() => deleteSession(session.id)}
                                  className="text-[10px] bg-red-600 text-white px-2 py-1 rounded font-bold"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setDeletingId(null)}
                                  className="text-[10px] bg-gray-200 text-gray-600 px-2 py-1 rounded font-bold"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingId(session.id);
                                }}
                                className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                              >
                                <X size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      {pastSessions.length === 0 && (
                          <div className="text-center py-12 bg-white rounded-3xl border border-gray-100 text-gray-400 text-sm">
                            No past attendance sessions found.
                          </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Stored Percentage Reports</h3>
                    <div className="bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm">
                      <table className="w-full text-left">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Reg No</th>
                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Name</th>
                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-center">Percentage</th>
                            <th className="px-6 py-4 text-right"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 text-sm">
                          {storedPercentages.map((p) => (
                            <tr key={p.id}>
                              <td className="px-6 py-4 font-mono">{p.registerNo}</td>
                              <td className="px-6 py-4 font-bold">{p.name}</td>
                              <td className="px-6 py-4 text-center">
                                <span className={`font-black px-2 py-1 rounded-lg ${p.percentage >= 75 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {p.percentage}%
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                {deletingId === p.id ? (
                                  <div className="flex gap-1 justify-end">
                                    <button onClick={() => deletePercentage(p.id)} className="text-[10px] bg-red-600 text-white px-2 py-1 rounded font-bold">Conf</button>
                                    <button onClick={() => setDeletingId(null)} className="text-[10px] bg-gray-200 text-gray-600 px-2 py-1 rounded font-bold">X</button>
                                  </div>
                                ) : (
                                  <button onClick={() => setDeletingId(p.id)} className="text-gray-300 hover:text-red-500">
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                          {storedPercentages.length === 0 && (
                            <tr>
                              <td colSpan={4} className="p-12 text-center text-gray-400 italic">No reports generated yet.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
               </div>
            </div>
          )}

          {loading && (
            <div className="flex justify-center p-12">
               <Loader2 className="animate-spin text-indigo-600" />
            </div>
          )}
        </div>

        <div className="lg:col-span-1">
          <AnimatePresence mode="wait">
            {activeTab === 'records' && selectedHistorySession ? (
              <motion.div
                key="history-detail"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden flex flex-col h-[700px]"
              >
                <div className="p-6 bg-gray-900 text-white">
                   <h3 className="font-bold">Roll Call Details</h3>
                   <p className="text-xs text-gray-400 mt-1">{selectedHistorySession.className}</p>
                   <div className="mt-4 flex gap-4">
                      <div className="flex-1 bg-white/10 rounded-xl p-3 text-center border border-white/5">
                         <p className="text-[10px] text-gray-400 uppercase font-bold">Present</p>
                         <p className="text-xl font-bold">{historyAttendance.length}</p>
                      </div>
                      <div className="flex-1 bg-white/10 rounded-xl p-3 text-center border border-white/5">
                         <p className="text-[10px] text-gray-400 uppercase font-bold">Absent</p>
                         <p className="text-xl font-bold">{Math.max(0, students.length - historyAttendance.length)}</p>
                      </div>
                   </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                   {students.length > 0 ? (
                     students.map((student) => {
                       const isPresent = historyAttendance.some(a => a.studentId === student.registerNo);
                       return (
                         <div key={student.id} className={`flex items-center p-3 rounded-xl border transition-all ${isPresent ? 'bg-green-50 border-green-100 shadow-sm' : 'bg-red-50 border-red-100'}`}>
                            <div className="flex-1 grid grid-cols-3 items-center gap-4">
                                <div className="flex flex-col">
                                  <span className="font-bold text-[10px] text-gray-400 uppercase tracking-tighter">{student.registerNo}</span>
                                  <span className="text-sm font-medium text-gray-900 truncate">{student.name}</span>
                                </div>
                                <div className="flex justify-end gap-2 items-center">
                                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${isPresent ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                                     {isPresent ? 'Present' : 'Absent'}
                                  </span>
                                  <button
                                    onClick={() => isPresent ? unmarkStudent(student) : markStudentPresent(student)}
                                    className={`p-1.5 rounded-lg transition-colors ${isPresent ? 'text-red-400 hover:bg-red-100' : 'text-green-400 hover:bg-green-100'}`}
                                    title={isPresent ? "Remove Attendance" : "Mark as Present"}
                                  >
                                    {isPresent ? <X size={14} /> : <CheckCircle2 size={14} />}
                                  </button>
                                </div>
                            </div>
                         </div>
                       );
                     })
                   ) : (
                     <div className="p-12 text-center text-gray-400 text-sm">
                       No students are currently registered to check against.
                     </div>
                   )}
                </div>
                <button 
                  onClick={() => setSelectedHistorySession(null)}
                  className="m-4 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition"
                >
                  Close Records
                </button>
              </motion.div>
            ) : activeSession ? (
              <motion.div
                key="active"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-xl border border-indigo-100 overflow-hidden flex flex-col h-[700px]"
              >
                <div className="p-6 bg-indigo-600 text-white">
                  <div className="flex justify-between items-start mb-4">
                    <h2 className="text-xl font-bold">Attendance Live</h2>
                    <div className="flex items-center gap-2">
                       {deletingId === activeSession.id ? (
                         <div className="flex gap-1 animate-in slide-in-from-right-2">
                           <button 
                             onClick={endSession}
                             className="bg-red-500 text-white text-[10px] px-2 py-1 rounded font-bold"
                           >
                             Confirm
                           </button>
                           <button 
                             onClick={() => setDeletingId(null)}
                             className="bg-white/20 text-white text-[10px] px-2 py-1 rounded font-bold"
                           >
                             Cancel
                           </button>
                         </div>
                       ) : (
                         <button
                           onClick={() => setDeletingId(activeSession.id)}
                           className="text-white bg-white/20 hover:bg-red-500 px-2 py-1 rounded-lg transition"
                         >
                           <X size={16} />
                         </button>
                       )}
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-xl flex items-center justify-center mb-4">
                    <QRCodeSVG 
                      value={activeSession.qrCodeData} 
                      size={200}
                      level="H"
                      includeMargin={false}
                    />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-xs opacity-80 uppercase tracking-widest font-bold">Scan to mark attendance</p>
                    {activeSession.expiryTime && (
                       <p className="text-[10px] font-mono bg-white/10 rounded-full px-2 py-0.5 inline-block">
                         Expires: {format(activeSession.expiryTime.toDate(), 'hh:mm:ss a')}
                       </p>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    Recent Joins ({attendance.length})
                  </h3>
                  <div className="space-y-4">
                    {attendance.map((record) => (
                      <div key={record.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold uppercase">
                          {record.studentName?.[0] || 'S'}
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-sm text-gray-900">{record.studentName}</p>
                          <p className="text-xs text-gray-500">{format(record.timestamp?.toDate() || new Date(), 'hh:mm:ss a')}</p>
                        </div>
                        <CheckCircle2 size={16} className="text-green-500" />
                      </div>
                    ))}
                    {attendance.length === 0 && (
                      <p className="text-center text-gray-400 text-sm py-12">Waiting for students...</p>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                className="bg-white p-12 rounded-2xl border-2 border-dashed border-gray-200 text-center space-y-4"
              >
                <QrCode className="w-12 h-12 text-gray-200 mx-auto" />
                <div className="text-gray-500 font-medium">Start a session to show QR code session details</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Modal for New Class */}
      <AnimatePresence>
        {isClassModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">New Class</h2>
                <button onClick={() => setIsClassModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X />
                </button>
              </div>
              <form onSubmit={handleCreateClass} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Class Name</label>
                  <input
                    required
                    type="text"
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="e.g. Computer Graphics"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Subject Code</label>
                  <input
                    required
                    type="text"
                    value={newClassCode}
                    onChange={(e) => setNewClassCode(e.target.value)}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="e.g. CS302"
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl mt-4 hover:bg-indigo-700 shadow-md"
                >
                  Create Class
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal for New Student */}
      <AnimatePresence>
        {isStudentModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">{editingStudent ? 'Edit Student' : 'Register Student'}</h2>
                <button onClick={() => { setIsStudentModalOpen(false); setEditingStudent(null); }} className="text-gray-400 hover:text-gray-600">
                  <X />
                </button>
              </div>
              <form onSubmit={handleCreateStudent} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Register Number</label>
                  <input
                    required
                    disabled={!!editingStudent}
                    type="text"
                    value={newRegNo}
                    onChange={(e) => setNewRegNo(e.target.value)}
                    className={`w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none ${editingStudent ? 'opacity-50 cursor-not-allowed' : ''}`}
                    placeholder="e.g. 2024CS001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Full Name</label>
                  <input
                    required
                    type="text"
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="e.g. John Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Password</label>
                  <div className="relative">
                    <input
                      required
                      type={visiblePasswords['new_student_pass'] ? 'text' : 'password'}
                      value={newStudentPass}
                      onChange={(e) => setNewStudentPass(e.target.value)}
                      className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="Set student password"
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility('new_student_pass')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600"
                    >
                      {visiblePasswords['new_student_pass'] ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <button 
                  type="submit"
                  className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl mt-4 hover:bg-indigo-700 shadow-md"
                >
                  {editingStudent ? 'Update Account' : 'Create Account'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal for Start Session */}
      <AnimatePresence>
        {isSessionModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Session Duration</h2>
                <button onClick={() => { setIsSessionModalOpen(false); setSelectedClassIdForSession(null); }} className="text-gray-400 hover:text-gray-600">
                  <X />
                </button>
              </div>
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-3">
                   {[
                     { label: '15 Minutes', value: 15 },
                     { label: '30 Minutes', value: 30 },
                     { label: '1 Hour', value: 60 },
                   ].map((opt) => (
                     <button
                       key={opt.value}
                       onClick={() => setSessionDuration(opt.value)}
                       className={`p-4 rounded-2xl border-2 transition-all text-left font-bold ${sessionDuration === opt.value ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-100 hover:border-gray-200 text-gray-600'}`}
                     >
                       {opt.label}
                     </button>
                   ))}
                </div>
                <button 
                  onClick={startSession}
                  className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 shadow-lg flex items-center justify-center gap-2"
                >
                  <QrCode size={20} /> Create Session
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal for Percentage Calculation */}
      <AnimatePresence>
        {isPercentageModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Percentage Calculator</h2>
                <button onClick={() => { setIsPercentageModalOpen(false); setCalculatedResult(null); }} className="text-gray-400 hover:text-gray-600">
                  <X />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Select Student</label>
                  <select 
                    value={calcRegNo}
                    onChange={(e) => {
                      const s = students.find(x => x.registerNo === e.target.value);
                      setCalcRegNo(e.target.value);
                      setCalcName(s?.name || '');
                      setCalculatedResult(null);
                    }}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select a student...</option>
                    {students.map(s => (
                      <option key={s.id} value={s.registerNo}>{s.registerNo} - {s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                  {isCalculating ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="animate-spin text-indigo-600" />
                    </div>
                  ) : calculatedResult ? (
                    <div className="text-center animate-in zoom-in-95">
                      <p className="text-sm font-bold text-indigo-600 uppercase">Calculation Result</p>
                      <h3 className="text-4xl font-black text-indigo-900 mt-2">{calculatedResult.percentage}%</h3>
                      <p className="text-xs text-indigo-500 mt-1">
                        Present: {calculatedResult.present} / Total: {calculatedResult.total}
                      </p>
                      <button
                        onClick={savePercentage}
                        className="w-full mt-4 py-2 bg-indigo-600 text-white font-bold rounded-xl text-sm shadow-md"
                      >
                        Add to Reports
                      </button>
                    </div>
                  ) : (
                    <div className="text-center text-gray-400 text-sm py-4">
                      Select a student and click calculate to see the attendance percentage.
                    </div>
                  )}
                </div>

                {!calculatedResult && (
                  <button 
                    onClick={calculatePercentage}
                    disabled={!calcRegNo || isCalculating}
                    className="w-full py-4 bg-gray-900 text-white font-bold rounded-2xl hover:bg-black disabled:opacity-50 transition shadow-lg"
                  >
                    Calculate
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
