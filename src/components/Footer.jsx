import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, Github, Mail } from 'lucide-react';

const PRODUCT_LINKS = [
  { label: 'Plan a Trip', to: '/plan-tour' },
  { label: 'Safety Map', to: '/safety-map' },
  { label: 'Translator', to: '/translator' },
  { label: 'SOS Center', to: '/sos' },
];

const COMPANY_LINKS = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'My Trips', to: '/my-trips' },
  { label: 'Profile', to: '/profile' },
];

function Footer() {
  return (
    <footer className="border-t border-[#DDD3C5] bg-white/60 backdrop-blur-sm">
      <div className="container-max px-4 sm:px-6 lg:px-8 py-12">
        {/* Top section — brand left, columns right */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-10">
          
          {/* Brand block — pinned left */}
          <div className="max-w-md">
            <Link to="/" className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-accent-primary/10 border border-accent-primary/30 flex items-center justify-center">
                <Shield className="w-4 h-4 text-accent-primary" />
              </div>
              <span className="text-lg font-bold text-text-primary">
                Safe<span className="text-accent-primary">Route</span> AI
              </span>
            </Link>
            <p className="text-text-secondary text-sm leading-relaxed">
              An Intelligent Travel Planning and Safety System. Making every journey
              safer, smarter, and more enjoyable with AI-powered insights.
            </p>
            <div className="flex items-center gap-3 mt-5">
              <a
                href="https://github.com/Dhruva-007/SafeRoute-AI"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-white border border-[#DDD3C5] flex items-center justify-center hover:bg-accent-primary/5 hover:border-accent-primary/40 transition-all"
                aria-label="GitHub"
              >
                <Github className="w-4 h-4 text-text-secondary" />
              </a>
              <a
                href="mailto:gantasaladhruvann01@gmail.com"
                className="w-9 h-9 rounded-lg bg-white border border-[#DDD3C5] flex items-center justify-center hover:bg-accent-primary/5 hover:border-accent-primary/40 transition-all"
                aria-label="Email"
              >
                <Mail className="w-4 h-4 text-text-secondary" />
              </a>
            </div>
          </div>

          {/* Link columns — pinned right */}
          <div className="grid grid-cols-2 gap-12 sm:gap-16 lg:gap-20">
            <div>
              <h4 className="text-sm font-semibold text-text-primary mb-4">Product</h4>
              <ul className="space-y-2.5">
                {PRODUCT_LINKS.map((item) => (
                  <li key={item.label}>
                    <Link
                      to={item.to}
                      className="text-sm text-text-secondary hover:text-accent-primary transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-text-primary mb-4">Account</h4>
              <ul className="space-y-2.5">
                {COMPANY_LINKS.map((item) => (
                  <li key={item.label}>
                    <Link
                      to={item.to}
                      className="text-sm text-text-secondary hover:text-accent-primary transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div className="border-t border-[#DDD3C5] mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-text-muted">
            © {new Date().getFullYear()} SafeRoute AI. All rights reserved.
          </p>
          <p className="text-xs text-text-muted">Built with safety in mind.</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;