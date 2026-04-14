import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Menu, X, Shield, LayoutDashboard, Map, Navigation, 
  AlertTriangle, Languages, User, Compass, LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function Navbar() {
  const { isLoggedIn, logout } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const loggedInLinks = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/plan-tour', label: 'Plan Tour', icon: Compass },
    { to: '/my-trips', label: 'My Trips', icon: Navigation },
    { to: '/safety-map', label: 'Safety Map', icon: Map },
    { to: '/sos', label: 'SOS', icon: AlertTriangle, highlight: true },
    { to: '/translator', label: 'Translator', icon: Languages },
    { to: '/profile', label: 'Profile', icon: User },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'bg-bg-primary/90 backdrop-blur-xl shadow-lg shadow-black/20 border-b border-border-subtle'
            : 'bg-transparent'
        }`}
      >
        <div className="container-max px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-18">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-lg bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center group-hover:bg-accent-primary/20 transition-colors duration-250">
                <Shield className="w-5 h-5 text-accent-primary" />
              </div>
              <span className="text-lg font-bold text-text-primary tracking-tight">
                Safe<span className="text-accent-primary">Route</span> AI
              </span>
            </Link>

            {/* Desktop Nav */}
            <div className="hidden lg:flex items-center gap-1">
              {isLoggedIn ? (
                <>
                  {loggedInLinks.map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-250 ${
                        link.highlight
                          ? isActive(link.to)
                            ? 'bg-red-500/20 text-red-400'
                            : 'text-red-400 hover:bg-red-500/10'
                          : isActive(link.to)
                          ? 'bg-accent-primary/15 text-accent-primary'
                          : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                      }`}
                    >
                      <link.icon className="w-4 h-4" />
                      {link.label}
                    </Link>
                  ))}
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-white/5 transition-all duration-250 ml-1"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className={`px-4 py-2 rounded-btn text-sm font-medium transition-all duration-250 ${
                      isActive('/login')
                        ? 'text-accent-primary'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Login
                  </Link>
                  <Link
                    to="/signup"
                    className="btn-primary text-sm !px-5 !py-2"
                  >
                    Sign Up
                  </Link>
                </>
              )}
            </div>

            {/* Mobile Hamburger */}
            <button
              className="lg:hidden p-2 rounded-lg hover:bg-white/5 transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5 text-text-primary" />
              ) : (
                <Menu className="w-5 h-5 text-text-primary" />
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3, ease: 'easeOut' }}
              className="fixed top-0 right-0 z-50 h-full w-72 bg-bg-primary border-l border-border-subtle shadow-2xl lg:hidden"
            >
              <div className="flex items-center justify-between p-4 border-b border-border-subtle">
                <span className="text-lg font-bold text-text-primary">
                  Safe<span className="text-accent-primary">Route</span> AI
                </span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-lg hover:bg-white/5"
                >
                  <X className="w-5 h-5 text-text-primary" />
                </button>
              </div>
              <div className="p-4 flex flex-col gap-1 overflow-y-auto h-[calc(100%-65px)]">
                {isLoggedIn ? (
                  <>
                    {loggedInLinks.map((link) => (
                      <Link
                        key={link.to}
                        to={link.to}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-250 ${
                          link.highlight
                            ? isActive(link.to)
                              ? 'bg-red-500/20 text-red-400'
                              : 'text-red-400 hover:bg-red-500/10'
                            : isActive(link.to)
                            ? 'bg-accent-primary/15 text-accent-primary'
                            : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                        }`}
                      >
                        <link.icon className="w-5 h-5" />
                        {link.label}
                      </Link>
                    ))}
                    <div className="border-t border-border-subtle mt-4 pt-4">
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-white/5 transition-all duration-250 w-full"
                      >
                        <LogOut className="w-5 h-5" />
                        Log Out
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <Link
                      to="/login"
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-white/5 transition-all"
                    >
                      Login
                    </Link>
                    <Link
                      to="/signup"
                      className="btn-primary text-center text-sm mt-2"
                    >
                      Sign Up
                    </Link>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Spacer */}
      <div className="h-16 lg:h-18" />
    </>
  );
}

export default Navbar;