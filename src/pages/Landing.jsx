import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import AnimatedSection from '../components/AnimatedSection';
import FeatureCard from '../components/FeatureCard';
import { 
  MapPin, Brain, AlertTriangle, Radio, MessageSquare,
  ChevronRight, Shield, Clock, Route, Zap, Star,
  Navigation, Thermometer, Activity
} from 'lucide-react';

function Landing() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();

  const handleStartPlanning = () => {
    if (isLoggedIn) {
      navigate('/plan-tour');
    } else {
      navigate('/login');
    }
  };

  const features = [
    {
      icon: Brain,
      title: 'Smart Travel Planning',
      description: 'AI-powered itinerary generation that considers weather, local events, fatigue levels, and your personal preferences.'
    },
    {
      icon: Activity,
      title: 'Travel Fatigue Predictor',
      description: 'Intelligent fatigue detection that analyzes your travel patterns and suggests optimal rest stops and activity pacing.'
    },
    {
      icon: AlertTriangle,
      title: 'Emergency Accessibility',
      description: 'One-tap SOS with automatic location sharing, nearest emergency services, and multilingual emergency phrase cards.'
    },
    {
      icon: Radio,
      title: 'Real-Time Safety Monitoring',
      description: 'Continuous safety assessment of your surroundings with crowd-sourced data and official safety advisories.'
    },
    {
      icon: MessageSquare,
      title: 'Context-Aware Phrase Generator',
      description: 'GPS-powered smart translation that adapts to your location — from ordering food to communicating in emergencies.'
    },
  ];

  const demoItinerary = [
    { time: '09:00', activity: 'Arrive at Kyoto Station', fatigue: 'low', type: 'transit' },
    { time: '10:00', activity: 'Fushimi Inari Shrine', fatigue: 'low', type: 'attraction' },
    { time: '12:30', activity: 'Nishiki Market — Lunch', fatigue: 'low', type: 'food' },
    { time: '14:00', activity: 'Kinkaku-ji Temple', fatigue: 'medium', type: 'attraction' },
    { time: '16:00', activity: 'Rest Break — Fatigue Alert', fatigue: 'rest', type: 'rest' },
    { time: '17:30', activity: 'Arashiyama Bamboo Grove', fatigue: 'low', type: 'attraction' },
  ];

  const fatigueLevelColors = {
    low: 'bg-green-500/20 text-green-400',
    medium: 'bg-amber-500/20 text-amber-400',
    high: 'bg-red-500/20 text-red-400',
    rest: 'bg-blue-500/20 text-blue-400',
  };

  return (
    <div className="overflow-hidden">
      {/* HERO */}
      <section className="relative min-h-[90vh] flex items-center">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-primary/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent-primary/3 rounded-full blur-3xl" />
        </div>

        <div className="container-max px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-primary/10 border border-accent-primary/20 mb-8">
                <Shield className="w-4 h-4 text-accent-primary" />
                <span className="text-xs font-medium text-accent-primary tracking-wide">AI-POWERED TRAVEL SAFETY</span>
              </div>

              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-text-primary leading-tight mb-6">
                Safe<span className="text-gradient">Route</span> AI
              </h1>

              <p className="text-lg sm:text-xl md:text-2xl text-text-secondary font-light max-w-2xl mx-auto mb-10 leading-relaxed">
                An Intelligent Travel Planning and Safety System
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={handleStartPlanning}
                  className="btn-primary flex items-center gap-2 text-base px-8 py-3.5 w-full sm:w-auto justify-center"
                >
                  Start Planning
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    document.getElementById('demo-section')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="btn-secondary flex items-center gap-2 text-base px-8 py-3.5 w-full sm:w-auto justify-center"
                >
                  Explore Demo
                </button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="grid grid-cols-3 gap-4 sm:gap-8 mt-16 max-w-lg mx-auto"
            >
              {[
                { value: '50K+', label: 'Safe Trips' },
                { value: '120+', label: 'Countries' },
                { value: '99.9%', label: 'Uptime' },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <p className="text-2xl sm:text-3xl font-bold text-accent-primary">{stat.value}</p>
                  <p className="text-xs sm:text-sm text-text-muted mt-1">{stat.label}</p>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="section-padding">
        <div className="container-max">
          <AnimatedSection className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
              Intelligent Features
            </h2>
            <p className="text-text-secondary max-w-xl mx-auto">
              Everything you need for safe, smart, and seamless travel — powered by AI.
            </p>
          </AnimatedSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feature, i) => (
              <FeatureCard
                key={feature.title}
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
                index={i}
              />
            ))}
          </div>
        </div>
      </section>

      {/* DEMO */}
      <section id="demo-section" className="section-padding bg-bg-card/30">
        <div className="container-max">
          <AnimatedSection className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
              See It In Action
            </h2>
            <p className="text-text-secondary max-w-xl mx-auto">
              A glimpse of how SafeRoute AI plans your journey with fatigue management at its core.
            </p>
          </AnimatedSection>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Itinerary */}
            <AnimatedSection className="lg:col-span-2" delay={0.1}>
              <div className="glass-card p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <Route className="w-5 h-5 text-accent-primary" />
                  <h3 className="text-lg font-semibold text-text-primary">Sample Itinerary — Kyoto, Japan</h3>
                </div>
                <div className="space-y-3">
                  {demoItinerary.map((item, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -12 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: i * 0.08 }}
                      className="flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
                    >
                      <span className="text-sm font-mono text-text-muted w-12 shrink-0">{item.time}</span>
                      <div className="w-2 h-2 rounded-full bg-accent-primary/60 shrink-0" />
                      <span className="text-sm text-text-primary flex-1">{item.activity}</span>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${fatigueLevelColors[item.fatigue]}`}>
                        {item.fatigue === 'rest' ? 'Rest' : item.fatigue}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </AnimatedSection>

            {/* Side Panels */}
            <div className="flex flex-col gap-6">
              {/* Fatigue Monitor */}
              <AnimatedSection delay={0.2}>
                <div className="glass-card p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <Activity className="w-5 h-5 text-accent-primary" />
                    <h3 className="text-base font-semibold text-text-primary">Fatigue Monitor</h3>
                  </div>
                  <div className="space-y-4">
                    {[
                      { label: 'Energy Level', value: 72, color: 'bg-green-500' },
                      { label: 'Walking Strain', value: 45, color: 'bg-amber-500' },
                      { label: 'Mental Fatigue', value: 30, color: 'bg-blue-500' },
                    ].map((item) => (
                      <div key={item.label}>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-text-secondary">{item.label}</span>
                          <span className="text-text-muted">{item.value}%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-white/10">
                          <motion.div
                            initial={{ width: 0 }}
                            whileInView={{ width: `${item.value}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 1, delay: 0.3 }}
                            className={`h-full rounded-full ${item.color}/60`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-amber-400/80 mt-4 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Rest suggested at 4:00 PM
                  </p>
                </div>
              </AnimatedSection>

              {/* Map Placeholder */}
              <AnimatedSection delay={0.3}>
                <div className="glass-card p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <MapPin className="w-5 h-5 text-accent-primary" />
                    <h3 className="text-base font-semibold text-text-primary">Safety Map</h3>
                  </div>
                  <div className="aspect-[4/3] rounded-xl bg-white/[0.03] border border-border-subtle flex items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 opacity-10">
                      <div className="grid grid-cols-8 grid-rows-6 h-full">
                        {Array.from({ length: 48 }).map((_, i) => (
                          <div key={i} className="border border-white/5" />
                        ))}
                      </div>
                    </div>
                    <div className="absolute top-1/4 left-1/3 w-3 h-3 rounded-full bg-green-500/50 animate-pulse-soft" />
                    <div className="absolute top-1/2 left-1/2 w-3 h-3 rounded-full bg-green-500/50 animate-pulse-soft" style={{ animationDelay: '0.5s' }} />
                    <div className="absolute top-3/4 right-1/3 w-3 h-3 rounded-full bg-amber-500/50 animate-pulse-soft" style={{ animationDelay: '1s' }} />
                    <div className="absolute top-1/3 right-1/4 w-2.5 h-2.5 rounded-full bg-red-500/40" />
                    
                    <div className="text-center relative z-10">
                      <Navigation className="w-6 h-6 text-accent-primary/50 mx-auto mb-2" />
                      <p className="text-xs text-text-muted">Live map preview</p>
                    </div>
                  </div>
                </div>
              </AnimatedSection>
            </div>
          </div>
        </div>
      </section>

      {/* SAFETY HIGHLIGHT */}
      <section className="section-padding">
        <div className="container-max">
          <AnimatedSection>
            <div className="glass-card p-8 sm:p-12 lg:p-16 text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-accent-primary/5 via-transparent to-accent-primary/3" />
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center mx-auto mb-8">
                  <Shield className="w-8 h-8 text-accent-primary" />
                </div>
                <blockquote className="text-xl sm:text-2xl md:text-3xl font-semibold text-text-primary leading-relaxed max-w-3xl mx-auto mb-6">
                  "Not just travel planning — intelligent safety-first navigation."
                </blockquote>
                <p className="text-text-secondary max-w-xl mx-auto">
                  SafeRoute AI combines real-time data, predictive analytics, and local intelligence to keep you safe wherever your journey takes you.
                </p>
                <div className="flex items-center justify-center gap-1 mt-6">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="w-5 h-5 text-accent-primary fill-accent-primary" />
                  ))}
                </div>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding">
        <div className="container-max">
          <AnimatedSection className="text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
              Ready to Travel Smarter?
            </h2>
            <p className="text-text-secondary max-w-md mx-auto mb-8">
              Join thousands of travelers who trust SafeRoute AI for safer journeys.
            </p>
            <button onClick={handleStartPlanning} className="btn-primary text-base px-10 py-4">
              Get Started — It's Free
            </button>
          </AnimatedSection>
        </div>
      </section>
    </div>
  );
}

export default Landing;