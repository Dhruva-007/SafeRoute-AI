import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';

import Navbar from './components/Navbar';
import Footer from './components/Footer';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import PlanTour from './pages/PlanTour';
import MyTrips from './pages/MyTrips';
import SafetyMap from './pages/SafetyMap';
import SOS from './pages/SOS';
import Translator from './pages/Translator';
import Profile from './pages/Profile';
import DatabaseTest from './pages/DatabaseTest';

import ProtectedRoute from './components/ProtectedRoute';
import GlobalAlertOverlay from './components/GlobalAlertOverlay';
import TrackingStatusBar from './components/TrackingStatusBar';

import { GeofencingProvider } from './context/GeofencingContext';

function AppLayout() {
  const location = useLocation();

  const hideFooterRoutes = ['/login', '/signup'];
  const shouldHideFooter = hideFooterRoutes.includes(location.pathname);

  return (
    <GeofencingProvider>
      <div className="min-h-screen relative bg-bg-primary text-text-primary overflow-x-hidden">
        
        {/* Premium ambient background */}
        <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
          
          {/* Warm gold ambient */}
          <div className="absolute -top-32 -left-32 w-[460px] h-[460px] rounded-full bg-accent-primary/8 blur-3xl animate-pulse-soft" />

          {/* Soft champagne ambient */}
          <div className="absolute top-1/4 -right-28 w-[380px] h-[380px] rounded-full bg-accent-soft/10 blur-3xl animate-float-soft" />

          {/* Lower soft glow */}
          <div className="absolute bottom-0 left-1/3 w-[280px] h-[280px] rounded-full bg-accent-primary/5 blur-3xl" />

          {/* Luxury mesh overlay */}
          <div className="absolute inset-0 mesh-bg opacity-70" />
        </div>

        <Navbar />
        <TrackingStatusBar />
        <GlobalAlertOverlay />

        <main className="relative z-10 flex-1">
          <Routes>
            {/* Public */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />

            {/* Protected */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/plan-tour"
              element={
                <ProtectedRoute>
                  <PlanTour />
                </ProtectedRoute>
              }
            />

            <Route
              path="/my-trips"
              element={
                <ProtectedRoute>
                  <MyTrips />
                </ProtectedRoute>
              }
            />

            <Route
              path="/safety-map"
              element={
                <ProtectedRoute>
                  <SafetyMap />
                </ProtectedRoute>
              }
            />

            <Route
              path="/sos"
              element={
                <ProtectedRoute>
                  <SOS />
                </ProtectedRoute>
              }
            />

            <Route
              path="/translator"
              element={
                <ProtectedRoute>
                  <Translator />
                </ProtectedRoute>
              }
            />

            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />

            <Route
              path="/database-test"
              element={
                <ProtectedRoute>
                  <DatabaseTest />
                </ProtectedRoute>
              }
            />
          </Routes>
        </main>

        {!shouldHideFooter && <Footer />}
      </div>
    </GeofencingProvider>
  );
}

function App() {
  return <AppLayout />;
}

export default App;