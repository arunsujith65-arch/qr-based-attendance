/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthProvider, useAuth } from './AuthContext';
import Login from './components/Login';
import StaffDashboard from './components/StaffDashboard';
import StudentDashboard from './components/StudentDashboard';
import AdminDashboard from './components/AdminDashboard';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Login />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {profile.role === 'admin' ? (
        <AdminDashboard />
      ) : profile.role === 'staff' ? (
        <StaffDashboard />
      ) : (
        <StudentDashboard />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

