import React, { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth, UserRole, UserProfile } from '../AuthContext';
import { LogIn, LogOut, GraduationCap, School, KeyRound, User as UserIcon, Loader2, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Login() {
  const { user, profile, setProfile, logout } = useAuth();
  const [view, setView] = useState<'selection' | 'staff' | 'student'>('selection');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Student Form State
  const [regNo, setRegNo] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleStaffLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      const docRef = doc(db, 'users', result.user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        setProfile(docSnap.data() as UserProfile);
      } else {
        const newProfile: UserProfile = {
          uid: result.user.uid,
          name: result.user.displayName || 'Staff User',
          email: result.user.email || '',
          role: 'staff',
          createdAt: serverTimestamp() as any,
        };
        await setDoc(docRef, newProfile);
        setProfile(newProfile);
      }
    } catch (err: any) {
      try {
        handleFirestoreError(err, OperationType.WRITE, 'users');
      } catch (fErr: any) {
        setError(fErr.message || 'Failed to login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // 1. Sign in anonymously FIRST to satisfy isSignedIn() rules for querying
      const userCredential = await signInAnonymously(auth);
      const authUid = userCredential.user.uid;

      // 2. Verify credentials in 'students' collection via query
      const studentsQuery = query(
        collection(db, 'students'),
        where('registerNo', '==', regNo),
        where('password', '==', password)
      );
      const studentSnap = await getDocs(studentsQuery);
      
      if (studentSnap.empty) {
        await auth.signOut();
        throw new Error('Invalid Register Number or Password');
      }

      const studentDoc = studentSnap.docs[0];
      const studentData = studentDoc.data();
      const studentId = studentDoc.id; // This is the scoped ID
      
      // 3. Update the student record with the current anonymous UID so we can verify them in rules
      await updateDoc(doc(db, 'students', studentId), {
        lastLoggedInUid: authUid,
        lastLoginAt: serverTimestamp()
      });

      // 4. Create/Update user profile in 'users' collection to satisfy isStudent() helper
      // AuthContext's onSnapshot will pick this up automatically
      const userProfileRef = doc(db, 'users', authUid);
      const userProfile: UserProfile = {
        uid: authUid,
        name: studentData.name,
        email: `${regNo}@manual.local`,
        role: 'student',
        studentId: regNo,
        staffId: studentData.staffId,
        createdAt: serverTimestamp() as any,
      };
      
      await setDoc(userProfileRef, userProfile);
      
      // 5. Progress is now handled by AuthContext onSnapshot
      // We can reset view but AuthContext will switch components
      
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  if (user && profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <div className="p-4 bg-green-50 text-green-700 rounded-full">
          <LogIn className="w-12 h-12" />
        </div>
        <h2 className="text-2xl font-bold font-sans">Welcome back, {profile.name}!</h2>
        <p className="text-gray-500">You are logged in as {profile.role}.</p>
        <button
          onClick={logout}
          className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
        >
          <LogOut size={18} /> Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <div className="text-center space-y-6">
        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           className="mb-8"
        >
          <div className="inline-block p-4 bg-indigo-100 text-indigo-600 rounded-2xl mb-4 cursor-pointer" onClick={() => setView('selection')}>
            <School className="w-12 h-12" />
          </div>
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">QR-Based Attendance</h1>
          <p className="text-gray-600 mt-2 text-lg">Attendance System</p>
        </motion.div>

        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-red-50 text-red-600 p-3 rounded-xl text-sm mb-4">
            {error}
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {view === 'selection' && (
            <motion.div
              key="selection"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <button
                onClick={() => setView('student')}
                className="flex flex-col items-center p-8 bg-white border-2 border-gray-100 rounded-2xl hover:border-indigo-500 hover:shadow-lg transition-all group"
              >
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors mb-3">
                  <GraduationCap className="w-8 h-8" />
                </div>
                <span className="font-bold text-gray-900">Student Login</span>
                <span className="text-sm text-gray-500 mt-1">Login with Register No</span>
              </button>

              <button
                onClick={() => setView('staff')}
                className="flex flex-col items-center p-8 bg-white border-2 border-gray-100 rounded-2xl hover:border-indigo-500 hover:shadow-lg transition-all group"
              >
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors mb-3">
                  <School className="w-8 h-8" />
                </div>
                <span className="font-bold text-gray-900">Staff Login</span>
                <span className="text-sm text-gray-500 mt-1">Login with Google ID</span>
              </button>
            </motion.div>
          )}

          {view === 'student' && (
            <motion.div
              key="student"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100"
            >
              <h2 className="text-2xl font-bold mb-6">Student Login</h2>
              <form onSubmit={handleStudentLogin} className="space-y-4 text-left">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Register Number</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-3 text-gray-400" size={18} />
                    <input
                      required
                      type="text"
                      className="w-full pl-10 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="Enter register no"
                      value={regNo}
                      onChange={(e) => setRegNo(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Password</label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-3 text-gray-400" size={18} />
                    <input
                      required
                      type={showPassword ? "text" : "password"}
                      className="w-full pl-10 pr-10 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <button
                  disabled={loading}
                  type="submit"
                  className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin" /> : <LogIn size={18} />} Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setView('selection')}
                  className="w-full text-sm text-gray-500 hover:text-gray-700 font-medium pt-2"
                >
                  Back to options
                </button>
              </form>
            </motion.div>
          )}

          {view === 'staff' && (
            <motion.div
              key="staff"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100"
            >
              <h2 className="text-2xl font-bold mb-6">Staff Access</h2>
              <p className="text-gray-500 mb-8">Please use your professional Google ID to securely access the staff dashboard and manage classes.</p>
              <button
                disabled={loading}
                onClick={handleStaffLogin}
                className="w-full py-4 bg-gray-900 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-gray-800 shadow-lg transition disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" /> : <LogIn size={18} />} Continue with Google
              </button>
              <button
                type="button"
                onClick={() => setView('selection')}
                className="w-full text-sm text-gray-500 hover:text-gray-700 font-medium pt-4"
              >
                Back to options
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="pt-8 border-t border-gray-100">
          <p className="text-sm text-gray-400">
            Powered by QR-Based Attendance Smart Systems
          </p>
        </div>
      </div>
    </div>
  );
}
