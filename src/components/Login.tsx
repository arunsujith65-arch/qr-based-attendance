import React, { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth, UserRole, UserProfile } from '../AuthContext';
import { LogIn, LogOut, GraduationCap, School, KeyRound, User as UserIcon, Loader2, Plus, Eye, EyeOff, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import AdminManagementDashboard from './AdminManagementDashboard';

export default function Login() {
  const { user, profile, setProfile, logout } = useAuth();
  const [view, setView] = useState<'selection' | 'admin' | 'staff' | 'student' | 'admin_management'>('selection');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [userId, setUserId] = useState(''); // Used for student/staff ID
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Admin Account List (for Management view)
  const [adminAccounts, setAdminAccounts] = useState<any[]>([]);

  // Admin OTP State (keeping for now, but will prioritize manual login)
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);

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

  const handleAdminSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phoneNumber })
      });
      const data = await response.json();
      if (!response.ok) {
        // If the server provided a debug OTP even on failure (for dev mode)
        if (data.debugOtp) {
          console.log("DEBUG: SMS failed but retrieved OTP from response:", data.debugOtp);
          setOtpSent(true);
          setError("Notice: SMS not configured. Using debug OTP (check console or use 123456 if unsure).");
          return;
        }
        throw new Error(data.error || 'Failed to send OTP');
      }
      setOtpSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleAdminVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Prioritize Admin Account check
      const q = query(
        collection(db, 'admin_accounts'),
        where('email', '==', phoneNumber.trim()), // Reusing phoneNumber field as email if it looks like one
        where('password', '==', otpCode.trim()) // Using otpCode field as password in manual mode
      );
      
      const snap = await getDocs(q);
      
      if (snap.empty) {
        throw new Error('Invalid Admin Email or Password');
      }

      const adminData = snap.docs[0].data();

      // On success, sign in anonymously for the session and set profile
      const userCredential = await signInAnonymously(auth);
      const authUid = userCredential.user.uid;

      const userProfile: UserProfile = {
        uid: authUid,
        name: adminData.schoolName || 'Admin User',
        email: adminData.email,
        role: 'admin',
        instanceId: adminData.instanceId || snap.docs[0].id, // Use doc ID as fallback
        createdAt: serverTimestamp() as any,
      };

      await setDoc(doc(db, 'users', authUid), userProfile);
      setProfile(userProfile);
    } catch (err: any) {
      setError(err.message || 'Verification failed');
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
            <>
              <motion.div
                key="selection"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6 max-w-lg mx-auto"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    onClick={() => setView('student')}
                    className="flex flex-col items-center p-6 bg-white border-2 border-gray-100 rounded-2xl hover:border-indigo-500 hover:shadow-lg transition-all group"
                  >
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors mb-3">
                      <GraduationCap className="w-6 h-6" />
                    </div>
                    <span className="font-bold text-gray-900">Student</span>
                    <span className="text-xs text-gray-500 mt-1">Check Attendance</span>
                  </button>

                  <button
                    onClick={() => setView('staff')}
                    className="flex flex-col items-center p-6 bg-white border-2 border-gray-100 rounded-2xl hover:border-indigo-500 hover:shadow-lg transition-all group"
                  >
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors mb-3">
                      <UserIcon className="w-6 h-6" />
                    </div>
                    <span className="font-bold text-gray-900">Staff</span>
                    <span className="text-xs text-gray-500 mt-1">Staff Access</span>
                  </button>

                  <button
                    onClick={() => setView('admin')}
                    className="flex flex-col items-center p-6 bg-white border-2 border-gray-100 rounded-2xl hover:border-indigo-500 hover:shadow-lg transition-all group"
                  >
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors mb-3">
                      <School className="w-6 h-6" />
                    </div>
                    <span className="font-bold text-gray-900">Admin</span>
                    <span className="text-xs text-gray-500 mt-1">Admin Login</span>
                  </button>
                </div>

                <div className="pt-6 border-t border-gray-50">
                  <button
                    onClick={() => {
                      setView('admin_management');
                    }}
                    className="w-full flex items-center justify-between p-4 bg-white border-2 border-gray-100 rounded-2xl hover:border-purple-500 hover:shadow-lg transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-purple-50 text-purple-600 rounded-xl group-hover:bg-purple-600 group-hover:text-white transition-colors">
                        <Plus className="w-6 h-6" />
                      </div>
                      <div className="text-left">
                        <span className="block font-bold text-gray-900">Administrator Control Center</span>
                        <span className="block text-xs text-gray-500 mt-0.5">Setup and manage institutional accounts</span>
                      </div>
                    </div>
                    <div className="p-2 text-gray-300 group-hover:text-purple-600 transition-colors">
                      <Plus size={20} />
                    </div>
                  </button>
                </div>
              </motion.div>
            </>
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
              <h2 className="text-2xl font-bold mb-2">Admin Login</h2>
              <p className="text-gray-500 mb-6 text-sm">Enter stored Admin ID and Password</p>
              
              <form onSubmit={handleAdminVerifyOTP} className="space-y-4 text-left">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Admin Email ID</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-3 text-gray-400" size={18} />
                    <input
                      required
                      type="email"
                      className="w-full pl-10 p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="admin@example.com"
                      value={phoneNumber} // Reusing field
                      onChange={(e) => setPhoneNumber(e.target.value)}
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
                      value={otpCode} // Reusing field
                      onChange={(e) => setOtpCode(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-gray-400"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <button
                  disabled={loading}
                  type="submit"
                  className="w-full py-4 bg-gray-900 text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-gray-800 transition disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin" /> : <LogIn size={18} />} Verify & Login
                </button>
              </form>

              <button
                type="button"
                onClick={() => setView('selection')}
                className="w-full text-sm text-gray-500 hover:text-gray-700 font-medium pt-4"
              >
                Back to options
              </button>
            </motion.div>
          )}

          {view === 'admin_management' && (
            <motion.div
              key="admin_management"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-gray-50 overflow-y-auto"
            >
              <AdminManagementDashboard onBack={() => setView('selection')} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="pt-8 border-t border-gray-100">
          <p className="text-sm text-gray-400">
            Powered By QR-Based Attendance System
          </p>
        </div>
      </div>
    </div>
  );
}
