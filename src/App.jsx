import React from 'react';
import { Routes, Route } from 'react-router-dom';
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
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/dashboard" element={
            <ProtectedRoute><Dashboard /></ProtectedRoute>
          } />
          <Route path="/plan-tour" element={
            <ProtectedRoute><PlanTour /></ProtectedRoute>
          } />
          <Route path="/my-trips" element={
            <ProtectedRoute><MyTrips /></ProtectedRoute>
          } />
          <Route path="/safety-map" element={
            <ProtectedRoute><SafetyMap /></ProtectedRoute>
          } />
          <Route path="/sos" element={
            <ProtectedRoute><SOS /></ProtectedRoute>
          } />
          <Route path="/translator" element={
            <ProtectedRoute><Translator /></ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute><Profile /></ProtectedRoute>
          } />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default App;