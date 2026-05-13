import { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, getDocs, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { Camera, LogOut, History, CheckCircle2, XCircle, Loader2, User, BookOpen, Clock, QrCode } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { motion, AnimatePresence } from 'motion/react';
import { format, differenceInSeconds } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';
import { signOut } from 'firebase/auth';

interface AttendanceRecord {
  id: string;
  sessionId: string;
  timestamp: any;
  studentId: string;
  status: 'present' | 'absent';
}

interface ActivityItem {
  id: string;
  type: 'session';
  sessionId: string;
  className: string;
  classCode: string;
  timestamp: any;
  isPresent: boolean;
  studentName: string;
  studentId: string;
}

interface ActiveSession extends ActivityItem {
  qrCodeData: string;
  status: 'active' | 'ended';
  startTime: any;
  expiryTime: any;
}

export default function StudentDashboard() {
  const { profile } = useAuth();
  const [history, setHistory] = useState<ActivityItem[]>([]);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isMarking, setIsMarking] = useState(false);

  useEffect(() => {
    if (!profile || profile.role !== 'student' || !profile.staffId) return;

    // Listen for active session for this student's staff
    const q = query(
      collection(db, 'sessions'),
      where('staffId', '==', profile.staffId),
      where('status', '==', 'active')
    );

    const unsubscribe = onSnapshot(q, async (snap) => {
      if (!snap.empty) {
        const sessionData = snap.docs[0].data();
        const session: any = { id: snap.docs[0].id, ...sessionData };
        
        // Fetch class name
        const classRef = doc(db, 'classes', sessionData.classId);
        const classSnap = await getDoc(classRef);
        if (classSnap.exists()) {
          session.className = classSnap.data().name;
          session.classCode = classSnap.data().code;
        }

        setActiveSession(session as ActiveSession);
      } else {
        setActiveSession(null);
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'sessions'));

    return () => unsubscribe();
  }, [profile]);

  useEffect(() => {
    if (!activeSession) return;

    const updateTimer = () => {
      if (activeSession.expiryTime) {
        const now = new Date();
        const expiry = activeSession.expiryTime.toDate();
        const diff = differenceInSeconds(expiry, now);

        if (diff <= 0) {
          setTimeLeft('Expired');
          setActiveSession(null);
        } else {
          const mins = Math.floor(diff / 60);
          const secs = diff % 60;
          setTimeLeft(`${mins}:${secs < 10 ? '0' : ''}${secs}`);
        }
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  useEffect(() => {
    if (!profile || profile.role !== 'student' || !profile.staffId || !profile.studentId) return;

    // 1. Fetch sessions for this staff since student was created
    const sessionsQ = query(
      collection(db, 'sessions'),
      where('staffId', '==', profile.staffId),
      where('startTime', '>=', profile.createdAt || new Date(0)),
      where('status', '==', 'ended'),
      orderBy('startTime', 'desc'),
      limit(30)
    );

    const attendanceQ = query(
      collection(db, 'attendance'),
      where('studentId', '==', profile.studentId),
      where('staffId', '==', profile.staffId),
      where('instanceId', '==', profile.instanceId || 'legacy')
    );

    const classesQ = query(
      collection(db, 'classes'),
      where('staffId', '==', profile.staffId)
    );

    let sessions: any[] = [];
    let attendance: any[] = [];
    let classes: any[] = [];

    const updateHistory = () => {
      const classesMap = new Map(classes.map(c => [c.id, c]));
      const attendanceMap = new Map(attendance.map(a => [a.sessionId, a]));

      const mergedHistory: ActivityItem[] = sessions.map(session => {
        const attendanceData = attendanceMap.get(session.id) as any;
        const cls = classesMap.get(session.classId);
        
        return {
          id: session.id,
          type: 'session',
          sessionId: session.id,
          className: cls?.name || 'Unknown Class',
          classCode: cls?.code || 'N/A',
          timestamp: attendanceData?.timestamp || session.startTime,
          isPresent: attendanceData?.status === 'present',
          studentName: profile.name,
          studentId: profile.studentId || ''
        };
      });

      setHistory(mergedHistory);
      setLoading(false);
    };

    const unsubscribeSessions = onSnapshot(sessionsQ, (snap) => {
      sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      updateHistory();
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'sessions'));

    const unsubscribeAttendance = onSnapshot(attendanceQ, (snap) => {
      attendance = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      updateHistory();
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'attendance'));

    const unsubscribeClasses = onSnapshot(classesQ, (snap) => {
      classes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      updateHistory();
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'classes'));

    return () => {
      unsubscribeSessions();
      unsubscribeAttendance();
      unsubscribeClasses();
    };
  }, [profile]);

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;

    if (isScanning) {
      scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
      scanner.render(onScanSuccess, onScanFailure);
    }

    return () => {
      if (scanner) {
        scanner.clear().catch(error => console.error("Failed to clear scanner", error));
      }
    };
  }, [isScanning]);

  const onScanSuccess = async (decodedText: string) => {
    setIsScanning(false);
    try {
      const qrData = JSON.parse(decodedText);
      await processAttendance(qrData.sessionId, qrData.classId);
    } catch (err) {
      setScanResult({ success: false, message: "Invalid QR Code format" });
    }
  };

  const processAttendance = async (sessionId: string, classId: string) => {
    if (isMarking) return;
    setIsMarking(true);
    try {
      // 1. Check if session is active and not expired
      const sessionRef = doc(db, 'sessions', sessionId);
      const sessionSnap = await getDoc(sessionRef);

      if (!sessionSnap.exists()) {
        throw new Error("Invalid session");
      }

      const sessionData = sessionSnap.data();
      if (sessionData.status !== 'active') {
        throw new Error("Session has already ended");
      }

      if (sessionData.expiryTime) {
        const expiryDate = sessionData.expiryTime.toDate();
        if (new Date() >= expiryDate) {
          throw new Error("Session QR code has expired");
        }
      }

      // 2. Check if already marked
      if (!profile?.studentId) {
        throw new Error("Student ID not found in profile");
      }

      const q = query(
        collection(db, 'attendance'),
        where('sessionId', '==', sessionId),
        where('studentId', '==', profile.studentId)
      );
      const existing = await getDocs(q);

      if (!existing.empty) {
        setScanResult({ success: true, message: "Attendance already marked for this session" });
        return;
      }

      // 3. Mark attendance
      if (!profile.staffId) {
        throw new Error("Missing staffId in profile");
      }

      await addDoc(collection(db, 'attendance'), {
        sessionId: sessionId,
        classId: classId,
        staffId: profile.staffId,
        studentId: profile.studentId,
        instanceId: profile.instanceId || 'legacy',
        uid: profile.uid,
        status: 'present',
        studentName: profile.name,
        studentEmail: profile.email,
        timestamp: serverTimestamp(),
      });

      setScanResult({ success: true, message: "Attendance marked successfully!" });
    } catch (err: any) {
      if (err.message && err.message.includes('{')) {
         setScanResult({ success: false, message: "Security error: Please try again" });
      } else {
        try {
          handleFirestoreError(err, OperationType.WRITE, 'attendance');
        } catch (fErr: any) {
           setScanResult({ success: false, message: fErr.message || "Failed to process attendance" });
        }
      }
    } finally {
      setIsMarking(false);
    }
  };

  const onScanFailure = (error: any) => {
    // console.warn(error);
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-bold text-xl uppercase">
            {profile?.name[0]}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">{profile?.name}</h1>
            <p className="text-xs text-gray-500 uppercase tracking-widest">{profile?.studentId || 'Student'}</p>
          </div>
        </div>
        <button
          onClick={() => signOut(auth)}
          className="p-2 text-gray-400 hover:text-red-500 transition"
        >
          <LogOut size={20} />
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Column: Action */}
        <div className="space-y-6">
          <AnimatePresence mode="wait">
            {activeSession ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl shadow-xl border-2 border-indigo-100 overflow-hidden relative group"
              >
                <div className="bg-indigo-600 p-6 text-white">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Active Session</p>
                      <h2 className="text-xl font-bold">{activeSession.className}</h2>
                      <p className="text-xs opacity-70 font-mono">{activeSession.classCode}</p>
                    </div>
                    <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md">
                       <Clock className="text-white" size={24} />
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between bg-white/10 rounded-2xl p-4 border border-white/5">
                    <div className="text-center flex-1">
                      <p className="text-[10px] font-bold uppercase opacity-60">Time Remaining</p>
                      <p className="text-3xl font-black font-mono tracking-tighter">{timeLeft}</p>
                    </div>
                  </div>
                </div>

                <div className="p-8 flex flex-col items-center">
                   <div className="bg-white p-4 rounded-3xl shadow-inner border border-gray-100 mb-6 group-hover:scale-105 transition-transform">
                      <QRCodeSVG 
                        value={activeSession.qrCodeData} 
                        size={160}
                        level="H"
                      />
                   </div>
                   
                   <button
                    disabled={isMarking}
                    onClick={() => processAttendance(activeSession.id, activeSession.classId)}
                    className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition flex items-center justify-center gap-2 group/btn disabled:opacity-50"
                   >
                     {isMarking ? (
                       <Loader2 className="animate-spin" />
                     ) : (
                       <>
                         <CheckCircle2 size={20} className="group-hover/btn:scale-110 transition-transform" />
                         Mark Arrival Directly
                       </>
                     )}
                   </button>
                   <p className="text-[10px] text-gray-400 mt-4 text-center font-medium">
                     You can mark attendance directly because you are logged in.
                   </p>
                </div>
              </motion.div>
            ) : (
              <motion.button
                key="no-session"
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsScanning(true)}
                className="w-full bg-indigo-600 text-white p-12 rounded-[40px] shadow-2xl shadow-indigo-200 flex flex-col items-center gap-6 group relative overflow-hidden h-[360px] justify-center"
              >
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="p-6 bg-white/20 rounded-3xl backdrop-blur-sm">
                   <Camera size={64} />
                </div>
                <div className="text-center">
                  <h2 className="text-3xl font-black tracking-tight">Mark Arrival</h2>
                  <p className="text-sm opacity-80 font-bold uppercase tracking-widest mt-2">Scan Session QR</p>
                </div>
                <div className="absolute bottom-6 left-6 right-6 p-4 bg-black/10 rounded-2xl flex items-center justify-between text-[10px] font-bold">
                   <span>CAMERA SCANNER</span>
                   <QrCode size={16} />
                </div>
              </motion.button>
            )}
          </AnimatePresence>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                 <CheckCircle2 size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500 uppercase font-bold tracking-tighter">Attended Classes</p>
                <p className="text-2xl font-black text-gray-900">{history.filter(h => h.isPresent).length}</p>
              </div>
            </div>
            <div className="text-right">
               <p className="text-sm font-bold text-indigo-600">Total Classes</p>
               <p className="text-xs text-gray-400">This Semester</p>
            </div>
          </div>
        </div>

        {/* Right Column: History */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col h-[500px]">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <History className="text-indigo-600" /> Attendance History
          </h2>
          
          <div className="flex-1 overflow-y-auto space-y-4">
            {history.map((item) => (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                key={item.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${item.isPresent ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    {item.isPresent ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  </div>
                  <div>
                    <p className="font-bold text-sm text-gray-900">{item.className}</p>
                    <div className="flex flex-col">
                      <p className="text-[10px] text-gray-500 font-medium leading-tight">
                        {item.studentName} · {item.studentId}
                      </p>
                      <p className="text-[10px] text-gray-400 font-mono uppercase leading-tight">
                        {item.isPresent ? 'Scan Time: ' : 'Missing Date: '}
                        {format(item.timestamp?.toDate() || new Date(), 'MMM dd, hh:mm a')}
                      </p>
                    </div>
                  </div>
                </div>
                <div className={`text-[10px] font-black px-2 py-1 rounded-lg ${item.isPresent ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                   {item.isPresent ? 'PRESENT' : 'ABSENT'}
                </div>
              </motion.div>
            ))}

            {loading && (
              <div className="flex justify-center p-12">
                 <Loader2 className="animate-spin text-indigo-600" />
              </div>
            )}

            {!loading && history.length === 0 && (
              <div className="text-center p-12 text-gray-400">
                <BookOpen className="mx-auto mb-2 opacity-50" size={32} />
                <p>No attendance history found.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scanner Overlay */}
      <AnimatePresence>
        {isScanning && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4">
             <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden relative shadow-2xl">
                <div id="reader" className="w-full"></div>
                <button 
                  onClick={() => setIsScanning(false)}
                  className="absolute top-4 right-4 p-2 bg-black/20 text-white rounded-full hover:bg-black/40 transition"
                >
                  <XCircle size={24} />
                </button>
             </div>
             <p className="text-white mt-8 font-bold text-lg">Align QR code within the box</p>
          </div>
        )}
      </AnimatePresence>

      {/* Result Backdrop */}
      <AnimatePresence>
        {scanResult && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-md z-[60] flex items-center justify-center p-4">
             <motion.div
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.9, opacity: 0 }}
               className="bg-white p-8 rounded-[40px] w-full max-w-xs text-center space-y-6 shadow-2xl"
             >
                <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center ${scanResult.success ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                   {scanResult.success ? <CheckCircle2 size={48} /> : <XCircle size={48} />}
                </div>
                <div>
                   <h3 className="text-2xl font-black text-gray-900">{scanResult.success ? 'Success!' : 'Failed'}</h3>
                   <p className="text-gray-500 mt-2 font-medium">{scanResult.message}</p>
                </div>
                <button
                  onClick={() => setScanResult(null)}
                  className="w-full py-4 bg-gray-900 text-white font-bold rounded-2xl hover:bg-gray-800 transition shadow-lg"
                >
                  Dismiss
                </button>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
