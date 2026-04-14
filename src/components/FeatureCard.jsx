import React from 'react';
import { Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

function FeatureCard({ icon: Icon, title, description, index = 0 }) {
  const { isLoggedIn } = useAuth();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="glass-card p-6 sm:p-8 group relative overflow-hidden hover:-translate-y-1 transition-all duration-250"
    >
      {/* Subtle gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <div className="relative z-10">
        <div className="w-12 h-12 rounded-xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center mb-5 group-hover:bg-accent-primary/15 transition-colors">
          {!isLoggedIn ? (
            <Lock className="w-5 h-5 text-text-muted" />
          ) : (
            <Icon className="w-5 h-5 text-accent-primary" />
          )}
        </div>

        <h3 className={`text-lg font-semibold mb-2.5 ${!isLoggedIn ? 'text-text-muted' : 'text-text-primary'}`}>
          {title}
        </h3>
        <p className={`text-sm leading-relaxed ${!isLoggedIn ? 'text-text-muted/70' : 'text-text-secondary'}`}>
          {description}
        </p>

        {!isLoggedIn && (
          <div className="mt-4 flex items-center gap-2 text-xs text-text-muted">
            <Lock className="w-3.5 h-3.5" />
            <span>Login to access</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default FeatureCard;