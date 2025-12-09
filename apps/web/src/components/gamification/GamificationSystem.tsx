'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GAMIFICATION SCORING SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Transforms the lead journey into an engaging game experience:
 * - Points for completing actions
 * - Level progression with rewards
 * - Achievement badges
 * - Time-limited bonuses
 * - Social proof integration
 *
 * Psychology: Gamification increases engagement by 40% and completion by 60%.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useCallback, useEffect, createContext, useContext } from 'react';
import {
  Star,
  Trophy,
  Zap,
  Gift,
  Clock,
  Users,
  TrendingUp,
  Award,
  CheckCircle2,
  Lock,
  Sparkles,
  Target,
  Heart,
  Shield,
  Crown,
  Flame,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  points: number;
  unlocked: boolean;
  unlockedAt?: Date;
  category: 'engagement' | 'progress' | 'social' | 'special';
}

interface Level {
  level: number;
  name: string;
  minPoints: number;
  maxPoints: number;
  reward: string;
  color: string;
}

interface GamificationState {
  points: number;
  level: Level;
  achievements: Achievement[];
  streak: number;
  multiplier: number;
  bonusEndTime?: Date;
}

interface GamificationContextType {
  state: GamificationState;
  addPoints: (amount: number, reason: string) => void;
  unlockAchievement: (achievementId: string) => void;
  activateBonus: (multiplier: number, durationMinutes: number) => void;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const LEVELS: Level[] = [
  { level: 1, name: 'Începător', minPoints: 0, maxPoints: 99, reward: 'Consultație gratuită', color: '#6B7A90' },
  { level: 2, name: 'Explorator', minPoints: 100, maxPoints: 299, reward: '10% reducere', color: '#3B82F6' },
  { level: 3, name: 'Avansat', minPoints: 300, maxPoints: 599, reward: '15% reducere', color: '#8B5CF6' },
  { level: 4, name: 'Expert', minPoints: 600, maxPoints: 999, reward: '20% reducere + CT gratuit', color: '#C9A962' },
  { level: 5, name: 'VIP Gold', minPoints: 1000, maxPoints: Infinity, reward: '25% reducere + pachet premium', color: '#F59E0B' },
];

const INITIAL_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-visit',
    name: 'Primul Pas',
    description: 'Ai vizitat pagina noastră',
    icon: <Star size={20} />,
    points: 10,
    unlocked: false,
    category: 'engagement',
  },
  {
    id: 'smile-simulator',
    name: 'Curioasă Transformare',
    description: 'Ai încercat simulatorul de zâmbet',
    icon: <Sparkles size={20} />,
    points: 50,
    unlocked: false,
    category: 'engagement',
  },
  {
    id: 'quiz-started',
    name: 'În Căutare',
    description: 'Ai început quiz-ul de evaluare',
    icon: <Target size={20} />,
    points: 25,
    unlocked: false,
    category: 'progress',
  },
  {
    id: 'quiz-completed',
    name: 'Determinat',
    description: 'Ai completat quiz-ul complet',
    icon: <Trophy size={20} />,
    points: 100,
    unlocked: false,
    category: 'progress',
  },
  {
    id: 'plan-generated',
    name: 'Planificator',
    description: 'Ai generat planul de tratament',
    icon: <Award size={20} />,
    points: 75,
    unlocked: false,
    category: 'progress',
  },
  {
    id: 'contact-shared',
    name: 'Conectat',
    description: 'Ai partajat datele de contact',
    icon: <Heart size={20} />,
    points: 150,
    unlocked: false,
    category: 'engagement',
  },
  {
    id: 'video-watched',
    name: 'Spectator Atent',
    description: 'Ai vizionat un video complet',
    icon: <Zap size={20} />,
    points: 30,
    unlocked: false,
    category: 'engagement',
  },
  {
    id: 'referred-friend',
    name: 'Ambasador',
    description: 'Ai recomandat unui prieten',
    icon: <Users size={20} />,
    points: 200,
    unlocked: false,
    category: 'social',
  },
  {
    id: 'early-bird',
    name: 'Matinal',
    description: 'Ai accesat înainte de ora 10',
    icon: <Clock size={20} />,
    points: 25,
    unlocked: false,
    category: 'special',
  },
  {
    id: 'night-owl',
    name: 'Bufniță',
    description: 'Ai accesat după ora 22',
    icon: <Clock size={20} />,
    points: 25,
    unlocked: false,
    category: 'special',
  },
  {
    id: 'streak-3',
    name: 'Persistent',
    description: '3 zile consecutive de vizite',
    icon: <Flame size={20} />,
    points: 100,
    unlocked: false,
    category: 'special',
  },
  {
    id: 'all-sections',
    name: 'Explorator Complet',
    description: 'Ai vizitat toate secțiunile',
    icon: <Crown size={20} />,
    points: 150,
    unlocked: false,
    category: 'engagement',
  },
];

// ============================================================================
// CONTEXT
// ============================================================================

const GamificationContext = createContext<GamificationContextType | null>(null);

export function useGamification() {
  const context = useContext(GamificationContext);
  if (!context) {
    throw new Error('useGamification must be used within GamificationProvider');
  }
  return context;
}

// ============================================================================
// PROVIDER
// ============================================================================

interface GamificationProviderProps {
  children: React.ReactNode;
  onLevelUp?: (level: Level) => void;
  onAchievementUnlocked?: (achievement: Achievement) => void;
}

export function GamificationProvider({
  children,
  onLevelUp,
  onAchievementUnlocked,
}: GamificationProviderProps) {
  const [state, setState] = useState<GamificationState>({
    points: 0,
    level: LEVELS[0],
    achievements: INITIAL_ACHIEVEMENTS,
    streak: 0,
    multiplier: 1,
  });

  // Calculate level from points
  const calculateLevel = useCallback((points: number): Level => {
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      if (points >= LEVELS[i].minPoints) {
        return LEVELS[i];
      }
    }
    return LEVELS[0];
  }, []);

  // Add points
  const addPoints = useCallback((amount: number, reason: string) => {
    setState(prev => {
      const multipliedAmount = Math.round(amount * prev.multiplier);
      const newPoints = prev.points + multipliedAmount;
      const newLevel = calculateLevel(newPoints);

      // Check for level up
      if (newLevel.level > prev.level.level) {
        onLevelUp?.(newLevel);
      }

      console.info('[Gamification] Points added:', {
        amount: multipliedAmount,
        reason,
        multiplier: prev.multiplier,
        totalPoints: newPoints,
      });

      return {
        ...prev,
        points: newPoints,
        level: newLevel,
      };
    });
  }, [calculateLevel, onLevelUp]);

  // Unlock achievement
  const unlockAchievement = useCallback((achievementId: string) => {
    setState(prev => {
      const achievement = prev.achievements.find(a => a.id === achievementId);
      if (!achievement || achievement.unlocked) return prev;

      const updatedAchievements = prev.achievements.map(a =>
        a.id === achievementId
          ? { ...a, unlocked: true, unlockedAt: new Date() }
          : a
      );

      const newPoints = prev.points + achievement.points;
      const newLevel = calculateLevel(newPoints);

      onAchievementUnlocked?.(achievement);

      console.info('[Gamification] Achievement unlocked:', {
        achievement: achievement.name,
        points: achievement.points,
      });

      return {
        ...prev,
        achievements: updatedAchievements,
        points: newPoints,
        level: newLevel,
      };
    });
  }, [calculateLevel, onAchievementUnlocked]);

  // Activate bonus multiplier
  const activateBonus = useCallback((multiplier: number, durationMinutes: number) => {
    const endTime = new Date(Date.now() + durationMinutes * 60 * 1000);
    setState(prev => ({
      ...prev,
      multiplier,
      bonusEndTime: endTime,
    }));

    // Reset multiplier after duration
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        multiplier: 1,
        bonusEndTime: undefined,
      }));
    }, durationMinutes * 60 * 1000);
  }, []);

  // Auto-unlock time-based achievements
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 10) {
      unlockAchievement('early-bird');
    } else if (hour >= 22) {
      unlockAchievement('night-owl');
    }
    // First visit achievement
    unlockAchievement('first-visit');
  }, [unlockAchievement]);

  return (
    <GamificationContext.Provider
      value={{ state, addPoints, unlockAchievement, activateBonus }}
    >
      {children}
    </GamificationContext.Provider>
  );
}

// ============================================================================
// COMPONENTS
// ============================================================================

/**
 * Points Display - Shows current points and level
 */
export function PointsDisplay() {
  const { state } = useGamification();
  const progressPercent = ((state.points - state.level.minPoints) /
    (state.level.maxPoints - state.level.minPoints)) * 100;

  return (
    <div className="points-display">
      <div className="level-badge" style={{ backgroundColor: state.level.color }}>
        <Crown size={16} />
        <span>Nivel {state.level.level}</span>
      </div>
      <div className="points-info">
        <span className="points-value">{state.points}</span>
        <span className="points-label">puncte</span>
      </div>
      <div className="level-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${Math.min(progressPercent, 100)}%`, backgroundColor: state.level.color }}
          />
        </div>
        <span className="next-level">
          {state.level.maxPoints < Infinity
            ? `${state.level.maxPoints - state.points} puncte până la ${LEVELS[state.level.level]?.name ?? 'Max'}`
            : 'Nivel maxim atins! 🎉'}
        </span>
      </div>
      {state.multiplier > 1 && (
        <div className="bonus-indicator">
          <Zap size={14} />
          <span>{state.multiplier}x Bonus Activ!</span>
        </div>
      )}

      <style jsx>{`
        .points-display {
          background: white;
          border-radius: 16px;
          padding: 1rem;
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        }

        .level-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.25rem 0.75rem;
          border-radius: 100px;
          color: white;
          font-size: 0.75rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
        }

        .points-info {
          margin-bottom: 0.5rem;
        }

        .points-value {
          font-size: 2rem;
          font-weight: 800;
          color: #0A1628;
        }

        .points-label {
          font-size: 0.9rem;
          color: #6B7A90;
          margin-left: 0.25rem;
        }

        .level-progress {
          margin-bottom: 0.5rem;
        }

        .progress-bar {
          height: 8px;
          background: #E8ECF1;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 0.25rem;
        }

        .progress-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.5s ease;
        }

        .next-level {
          font-size: 0.75rem;
          color: #6B7A90;
        }

        .bonus-indicator {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.25rem 0.5rem;
          background: linear-gradient(135deg, #FEF3C7, #FDE68A);
          color: #D97706;
          border-radius: 100px;
          font-size: 0.75rem;
          font-weight: 700;
          animation: pulse 1s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}

/**
 * Achievements Panel - Shows all achievements
 */
export function AchievementsPanel() {
  const { state } = useGamification();
  const unlockedCount = state.achievements.filter(a => a.unlocked).length;

  return (
    <div className="achievements-panel">
      <div className="panel-header">
        <Trophy size={20} />
        <h3>Realizări ({unlockedCount}/{state.achievements.length})</h3>
      </div>
      <div className="achievements-grid">
        {state.achievements.map(achievement => (
          <div
            key={achievement.id}
            className={`achievement ${achievement.unlocked ? 'unlocked' : 'locked'}`}
          >
            <div className="achievement-icon">
              {achievement.unlocked ? achievement.icon : <Lock size={20} />}
            </div>
            <div className="achievement-info">
              <span className="achievement-name">{achievement.name}</span>
              <span className="achievement-desc">{achievement.description}</span>
            </div>
            <div className="achievement-points">
              +{achievement.points}
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .achievements-panel {
          background: white;
          border-radius: 16px;
          padding: 1.5rem;
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        }

        .panel-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .panel-header svg {
          color: #C9A962;
        }

        .panel-header h3 {
          font-size: 1rem;
          font-weight: 700;
          color: #0A1628;
          margin: 0;
        }

        .achievements-grid {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .achievement {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          background: #F7F8FA;
          border-radius: 12px;
          transition: all 0.2s ease;
        }

        .achievement.locked {
          opacity: 0.5;
        }

        .achievement.unlocked {
          background: linear-gradient(135deg, rgba(201,169,98,0.1), rgba(201,169,98,0.05));
          border: 1px solid rgba(201,169,98,0.3);
        }

        .achievement-icon {
          width: 40px;
          height: 40px;
          background: white;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #C9A962;
        }

        .achievement.locked .achievement-icon {
          color: #6B7A90;
        }

        .achievement-info {
          flex: 1;
        }

        .achievement-name {
          display: block;
          font-weight: 600;
          color: #0A1628;
          font-size: 0.9rem;
        }

        .achievement-desc {
          display: block;
          font-size: 0.75rem;
          color: #6B7A90;
        }

        .achievement-points {
          font-weight: 700;
          color: #C9A962;
          font-size: 0.85rem;
        }

        .achievement.locked .achievement-points {
          color: #6B7A90;
        }
      `}</style>
    </div>
  );
}

/**
 * Rewards Panel - Shows available rewards
 */
export function RewardsPanel() {
  const { state } = useGamification();

  return (
    <div className="rewards-panel">
      <div className="panel-header">
        <Gift size={20} />
        <h3>Recompense Disponibile</h3>
      </div>
      <div className="rewards-list">
        {LEVELS.map(level => {
          const isUnlocked = state.points >= level.minPoints;
          return (
            <div
              key={level.level}
              className={`reward ${isUnlocked ? 'unlocked' : 'locked'}`}
            >
              <div className="reward-level" style={{ backgroundColor: isUnlocked ? level.color : '#E8ECF1' }}>
                {level.level}
              </div>
              <div className="reward-info">
                <span className="reward-name">{level.name}</span>
                <span className="reward-value">{level.reward}</span>
              </div>
              {isUnlocked ? (
                <CheckCircle2 size={20} className="reward-status unlocked" />
              ) : (
                <Lock size={20} className="reward-status locked" />
              )}
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .rewards-panel {
          background: white;
          border-radius: 16px;
          padding: 1.5rem;
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        }

        .panel-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .panel-header svg {
          color: #C9A962;
        }

        .panel-header h3 {
          font-size: 1rem;
          font-weight: 700;
          color: #0A1628;
          margin: 0;
        }

        .rewards-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .reward {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          background: #F7F8FA;
          border-radius: 12px;
        }

        .reward.locked {
          opacity: 0.6;
        }

        .reward-level {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 700;
          font-size: 0.9rem;
        }

        .reward-info {
          flex: 1;
        }

        .reward-name {
          display: block;
          font-weight: 600;
          color: #0A1628;
          font-size: 0.9rem;
        }

        .reward-value {
          display: block;
          font-size: 0.8rem;
          color: #6B7A90;
        }

        .reward-status {
          flex-shrink: 0;
        }

        .reward-status.unlocked {
          color: #10B981;
        }

        .reward-status.locked {
          color: #6B7A90;
        }
      `}</style>
    </div>
  );
}

/**
 * Social Proof Widget - Shows activity
 */
export function SocialProofWidget() {
  const [recentActivity, setRecentActivity] = useState<string[]>([]);

  // Simulate real-time activity
  useEffect(() => {
    const activities = [
      'Maria din București tocmai a rezervat o consultație',
      'Ion din Cluj a generat planul de tratament',
      '5 persoane au completat quiz-ul în ultima oră',
      'Alexandru din Timișoara a primit 20% reducere',
      '23 de pacienți noi săptămâna aceasta',
    ];

    setRecentActivity([activities[0]]);

    const interval = setInterval(() => {
      setRecentActivity(prev => {
        const newIndex = (activities.indexOf(prev[0]) + 1) % activities.length;
        return [activities[newIndex]];
      });
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="social-proof">
      <div className="proof-icon">
        <Users size={16} />
      </div>
      <div className="proof-content">
        <TrendingUp size={14} className="trend-icon" />
        <span>{recentActivity[0]}</span>
      </div>

      <style jsx>{`
        .social-proof {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          background: linear-gradient(135deg, #F0FDF4, #DCFCE7);
          border: 1px solid #86EFAC;
          border-radius: 12px;
          animation: slideIn 0.3s ease;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .proof-icon {
          width: 32px;
          height: 32px;
          background: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #10B981;
        }

        .proof-content {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
          color: #065F46;
        }

        .trend-icon {
          color: #10B981;
        }
      `}</style>
    </div>
  );
}

/**
 * Time-Limited Offer - Creates urgency
 */
interface TimeLimitedOfferProps {
  title: string;
  description: string;
  discount: string;
  endTime: Date;
  onClaim?: () => void;
}

export function TimeLimitedOffer({
  title,
  description,
  discount,
  endTime,
  onClaim,
}: TimeLimitedOfferProps) {
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const diff = endTime.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft('Expirat');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  return (
    <div className="time-offer">
      <div className="offer-badge">
        <Flame size={16} />
        <span>Ofertă Limitată</span>
      </div>
      <div className="offer-content">
        <h4>{title}</h4>
        <p>{description}</p>
        <div className="offer-discount">{discount}</div>
      </div>
      <div className="offer-timer">
        <Clock size={18} />
        <span className="timer-value">{timeLeft}</span>
        <span className="timer-label">rămas</span>
      </div>
      <button className="claim-btn" onClick={onClaim}>
        <Sparkles size={18} />
        <span>Revendică Acum</span>
      </button>

      <style jsx>{`
        .time-offer {
          background: linear-gradient(135deg, #0A1628, #152238);
          border-radius: 16px;
          padding: 1.5rem;
          color: white;
          text-align: center;
        }

        .offer-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.25rem 0.75rem;
          background: linear-gradient(135deg, #EF4444, #DC2626);
          border-radius: 100px;
          font-size: 0.75rem;
          font-weight: 700;
          margin-bottom: 1rem;
        }

        .offer-content h4 {
          font-size: 1.25rem;
          margin-bottom: 0.5rem;
        }

        .offer-content p {
          font-size: 0.9rem;
          opacity: 0.8;
          margin-bottom: 0.75rem;
        }

        .offer-discount {
          font-size: 2rem;
          font-weight: 800;
          color: #C9A962;
          margin-bottom: 1rem;
        }

        .offer-timer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .timer-value {
          font-size: 1.5rem;
          font-weight: 700;
          font-family: monospace;
        }

        .timer-label {
          font-size: 0.85rem;
          opacity: 0.7;
        }

        .claim-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
          padding: 1rem;
          background: linear-gradient(135deg, #C9A962, #E8D5A3);
          color: #0A1628;
          border: none;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.2s ease;
        }

        .claim-btn:hover {
          transform: scale(1.02);
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default GamificationProvider;
