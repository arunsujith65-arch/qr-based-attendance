import React, { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth, UserRole, UserProfile } from '../AuthContext';
import { LogIn, LogOut, GraduationCap, School, KeyRound, User as UserIcon, Loader2, Plus, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Login() {
  const { user, profile, setProfile, logout } = useAuth();
  const [view, setView] = useState<'selection' | 'admin' | 'staff' | 'student'>('selection');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [userId, setUserId] = useState(''); // Used for student/staff ID
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleGoogleLogin = async (role: UserRole) => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      const docRef = doc(db, 'users', result.user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        // If user already has a profile, just set it and we're done
        setProfile(data);
      } else {
        // New User logic
        // Any Google login via Admin path gets Admin role (as per user's "Any Gmail account can login" for admin)
        if (role !== 'admin') {
          throw new Error('Only Admin accounts can login with Google');
        }
        const newProfile: UserProfile = {
          uid: result.user.uid,
          name: result.user.displayName || 'Admin User',
          email: result.user.email || '',
          role: 'admin',
          createdAt: serverTimestamp() as any,
        };
        await setDoc(docRef, newProfile);
        setProfile(newProfile);
      }
    } catch (err: any) {
      if (err.code === 'auth/unauthorized-domain') {
        const currentHost = window.location.hostname;
        setError(`Unauthorized Domain: Please add "${currentHost}" to authorized domains in Firebase Console (Authentication > Settings > Authorized domains).`);
      } else {
        setError(err.message || 'Failed to login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualLogin = async (e: React.FormEvent, role: 'staff' | 'student') => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // 1. Sign in anonymously FIRST to satisfy isSignedIn() rules for querying
      const userCredential = await signInAnonymously(auth);
      const authUid = userCredential.user.uid;

      const collectionName = role === 'staff' ? 'staff_registrations' : 'students';
      const idField = role === 'staff' ? 'staffId' : 'registerNo';

      // 2. Verify credentials via query
      const q = query(
        collection(db, collectionName),
        where(idField, '==', userId.trim()),
        where('password', '==', password.trim())
      );
      const snap = await getDocs(q);
      
      if (snap.empty) {
        await auth.signOut();
        throw new Error(`Invalid ${role === 'staff' ? 'Staff ID' : 'Register Number'} or Password`);
      }

      const credentialDoc = snap.docs[0];
      const credentialData = credentialDoc.data();
      const internalId = credentialDoc.id;
      
      // 3. Update the record with the current anonymous UID
      await updateDoc(doc(db, collectionName, internalId), {
        lastLoggedInUid: authUid,
        lastLoginAt: serverTimestamp()
      });

      // 4. Create/Update user profile in 'users' collection
      const userProfileRef = doc(db, 'users', authUid);
      const userProfile: UserProfile = {
        uid: authUid,
        name: credentialData.name,
        email: role === 'staff' ? `${userId.trim()}@staff.local` : `${userId.trim()}@student.local`,
        role: role,
        studentId: role === 'student' ? userId.trim() : null,
        staffId: (role === 'staff' ? userId.trim() : credentialData.staffId) || null,
        instanceId: credentialData.instanceId || null,
        createdAt: serverTimestamp() as any,
      };
      
      await setDoc(userProfileRef, userProfile);
      setProfile(userProfile);
      
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
              className="grid grid-cols-1 md:grid-cols-3 gap-4"
            >
              <button
                onClick={() => setView('student')}
                className="flex flex-col items-center p-6 bg-white border-2 border-gray-100 rounded-2xl hover:border-indigo-500 hover:shadow-lg transition-all group"
              >
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors mb-3">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <span className="font-bold text-gray-900">Student</span>
                <span className="text-xs text-gray-500 mt-1">Reg No</span>
              </button>

              <button
                onClick={() => setView('staff')}
                className="flex flex-col items-center p-6 bg-white border-2 border-gray-100 rounded-2xl hover:border-indigo-500 hover:shadow-lg transition-all group"
              >
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors mb-3">
                  <School className="w-6 h-6" />
                </div>
                <span className="font-bold text-gray-900">Staff</span>
                <span className="text-xs text-gray-500 mt-1">Staff ID</span>
              </button>

              <button
                onClick={() => setView('admin')}
                className="flex flex-col items-center p-6 bg-white border-2 border-gray-100 rounded-2xl hover:border-indigo-500 hover:shadow-lg transition-all group"
              >
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors mb-3">
                  <School className="w-6 h-6" />
                </div>
                <span className="font-bold text-gray-900">Admin</span>
                <span className="text-xs text-gray-500 mt-1">Google Login</span>
              </button>
            </motion.div>
          )}

          {(view === 'student' || view === 'staff') && (
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100"
            >
              <h2 className="text-2xl font-bold mb-6 capitalize">{view} Login</h2>
              <form onSubmit={(e) => handleManualLogin(e, view as 'staff' | 'student')} className="space-y-4 text-left">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">
                    {view === 'staff' ? 'Staff ID' : 'Register Number'}
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-3 text-gray-400" size={18} />
                    <input
                      required
                      type="text"
                      className="w-full pl-10 p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder={`Enter ${view === 'staff' ? 'staff id' : 'register no'}`}
                      value={userId}
                      onChange={(e) => setUserId(e.target.value)}
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

          {view === 'admin' && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100"
            >
              <h2 className="text-2xl font-bold mb-6">Admin Access</h2>
              <p className="text-gray-500 mb-8">Google Login for Administrators</p>
              <button
                disabled={loading}
                onClick={() => handleGoogleLogin('admin')}
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
