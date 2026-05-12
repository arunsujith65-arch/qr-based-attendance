import { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, getDocs, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { Camera, LogOut, History, CheckCircle2, XCircle, Loader2, User, BookOpen } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { signOut } from 'firebase/auth';

interface AttendanceRecord {
  id: string;
  sessionId: string;
  timestamp: any;
  studentId: string;
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

export default function StudentDashboard() {
  const { profile } = useAuth();
  const [history, setHistory] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!profile || !profile.staffId || !profile.studentId) return;

    // 1. Fetch sessions for this staff
    const sessionsQ = query(
      collection(db, 'sessions'),
      where('staffId', '==', profile.staffId),
      where('status', '==', 'ended'),
      orderBy('startTime', 'desc'),
      limit(30)
    );

    const attendanceQ = query(
      collection(db, 'attendance'),
      where('studentId', '==', profile.studentId)
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
        const attendanceData = attendanceMap.get(session.id);
        const cls = classesMap.get(session.classId);
        
        return {
          id: session.id,
          type: 'session',
          sessionId: session.id,
          className: cls?.name || 'Unknown Class',
          classCode: cls?.code || 'N/A',
          timestamp: attendanceData?.timestamp || session.startTime,
          isPresent: !!attendanceData,
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
    }, (err) => console.error("Sessions listener error:", err));

    const unsubscribeAttendance = onSnapshot(attendanceQ, (snap) => {
      attendance = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      updateHistory();
    }, (err) => console.error("Attendance listener error:", err));

    const unsubscribeClasses = onSnapshot(classesQ, (snap) => {
      classes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      updateHistory();
    }, (err) => console.error("Classes listener error:", err));

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
      if (!qrData.sessionId || !profile) {
        throw new Error("Invalid QR Code");
      }

      // 1. Check if session is active and not expired
      const sessionRef = doc(db, 'sessions', qrData.sessionId);
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
      const q = query(
        collection(db, 'attendance'),
        where('sessionId', '==', qrData.sessionId),
        where('studentId', '==', profile.studentId)
      );
      const existing = await getDocs(q);

      if (!existing.empty) {
        setScanResult({ success: true, message: "Attendance already marked for this session" });
        return;
      }

      // 3. Mark attendance
      await addDoc(collection(db, 'attendance'), {
        sessionId: qrData.sessionId,
        classId: qrData.classId,
        studentId: profile.studentId,
        uid: profile.uid,
        studentName: profile.name,
        studentEmail: profile.email,
        timestamp: serverTimestamp(),
      });

      setScanResult({ success: true, message: "Attendance marked successfully!" });
    } catch (err: any) {
      if (err.message && err.message.includes('{')) {
         // Already JSON from handleFirestoreError
         setScanResult({ success: false, message: "Security error: Please try again" });
      } else {
        try {
          handleFirestoreError(err, OperationType.WRITE, 'attendance');
        } catch (fErr: any) {
           setScanResult({ success: false, message: fErr.message || "Failed to process attendance" });
        }
      }
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
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsScanning(true)}
            className="w-full bg-indigo-600 text-white p-8 rounded-3xl shadow-xl shadow-indigo-200 flex flex-col items-center gap-4 group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="p-4 bg-white/20 rounded-2xl backdrop-blur-sm">
               <Camera size={48} />
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold">Mark Attendance</h2>
              <p className="text-sm opacity-80 font-medium">Scan session QR code</p>
            </div>
          </motion.button>

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
