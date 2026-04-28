/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Bell, 
  TrendingUp, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  MoreHorizontal, 
  Utensils, 
  Car, 
  Briefcase,
  LayoutGrid,
  PlusCircle,
  Target,
  Settings,
  Sparkles,
  X,
  Plus,
  Loader2,
  ChevronLeft,
  User,
  Shield,
  Palette,
  LogOut,
  ChevronRight,
  Camera,
  Moon,
  Sun
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  setDoc, 
  doc, 
  deleteDoc, 
  updateDoc, 
  serverTimestamp,
  getDoc
} from 'firebase/firestore';
import { auth, db, loginWithGoogle, logout, handleFirestoreError, OperationType } from './lib/firebase';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface Transaction {
  id: string | number;
  name: string;
  amount: number;
  category: 'food' | 'transport' | 'salary' | 'other';
  createdAt?: any;
}

interface Goal {
  id: string | number;
  title: string;
  target: number;
  current: number;
  iconType: string;
  color: string;
}

const CATEGORY_MAP = {
  food: { icon: <Utensils className="w-6 h-6 text-orange-500" />, bgColor: 'bg-orange-50' },
  transport: { icon: <Car className="w-6 h-6 text-blue-500" />, bgColor: 'bg-blue-50' },
  salary: { icon: <Briefcase className="w-6 h-6 text-emerald-500" />, bgColor: 'bg-emerald-50' },
  other: { icon: <Plus className="w-6 h-6 text-slate-500" />, bgColor: 'bg-slate-50' },
};

type View = 'inicio' | 'metas' | 'ajustes' | 'historial';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('inicio');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  const [isAdding, setIsAdding] = useState(false);
  const [isAddingGoal, setIsAddingGoal] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [userName, setUserName] = useState("Cargando...");
  const [profileImage, setProfileImage] = useState("https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150&h=150");

  // Sync Auth State
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        // Init profile if new
        const userDoc = doc(db, 'users', u.uid);
        getDoc(userDoc).then(snap => {
          if (!snap.exists()) {
            setDoc(userDoc, {
              userName: u.displayName || "Usuario",
              profileImage: u.photoURL || profileImage
            }).catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${u.uid}`));
            
            // Also init private info
            setDoc(doc(db, 'users', u.uid, 'private', 'info'), {
              email: u.email
            }).catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${u.uid}/private/info`));
          } else {
            const data = snap.data();
            setUserName(data.userName);
            setProfileImage(data.profileImage);
          }
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync Data
  React.useEffect(() => {
    if (!user) return;

    const txQuery = query(collection(db, 'users', user.uid, 'transactions'), orderBy('createdAt', 'desc'));
    const goalsQuery = query(collection(db, 'users', user.uid, 'goals'));

    const unsubscribeTx = onSnapshot(txQuery, 
      (snap) => {
        setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}/transactions`)
    );

    const unsubscribeGoals = onSnapshot(goalsQuery, 
      (snap) => {
        setGoals(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}/goals`)
    );

    return () => {
      unsubscribeTx();
      unsubscribeGoals();
    };
  }, [user]);

  // Stats calculations
  const stats = useMemo(() => {
    const baseBalance = 24562.00 - 4153.30; 
    const currentIncome = transactions.filter(t => t.amount > 0).reduce((acc, curr) => acc + curr.amount, 0);
    const currentExpenses = transactions.filter(t => t.amount < 0).reduce((acc, curr) => acc + Math.abs(curr.amount), 0);
    const total = baseBalance + currentIncome - currentExpenses;
    return { total, income: currentIncome, expenses: currentExpenses };
  }, [transactions]);

  const handleAddTransaction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const amount = parseFloat(formData.get('amount') as string);
    const type = formData.get('type') as string;
    const category = formData.get('category') as any;

    const path = `users/${user.uid}/transactions`;
    try {
      const newTxRef = doc(collection(db, path));
      await setDoc(newTxRef, {
        name,
        amount: type === 'expense' ? -Math.abs(amount) : Math.abs(amount),
        category,
        userId: user.uid,
        createdAt: serverTimestamp()
      });
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const handleAddGoal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    const target = parseFloat(formData.get('target') as string);
    const color = formData.get('color') as string;
    const iconType = formData.get('icon') as string;
    
    const path = `users/${user.uid}/goals`;
    try {
      const newGoalRef = doc(collection(db, path));
      await setDoc(newGoalRef, {
        title,
        target,
        current: 0,
        iconType,
        color,
        userId: user.uid
      });
      setIsAddingGoal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const getAiInsight = async () => {
    setIsAiLoading(true);
    setAiInsight(null);
    try {
    const txSummary = transactions.map(t => `${t.name}: ${t.amount}`).join(', ');
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analiza estas transacciones financieras y da un consejo corto (max 2 frases), motivador y tranquilo en español: ${txSummary}. Saldo total actual: $${stats.total}. El tono debe ser Zen y profesional.`,
      });
      setAiInsight(response.text || "Tu salud financiera se ve estable. ¡Sigue así!");
    } catch (error) {
      console.error("Gemini Error:", error);
      setAiInsight("No pude obtener consejos en este momento, pero recuerda mantener un balance equilibrado.");
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className={`min-h-screen bg-background text-on-surface font-sans selection:bg-primary/20 overflow-x-hidden ${isDarkMode ? 'dark' : ''}`}>
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Sincronizando...</p>
        </div>
      ) : !user ? (
        <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center space-y-8">
          <div className="w-24 h-24 bg-primary/10 rounded-[32px] flex items-center justify-center shadow-xl shadow-primary/5">
            <Sparkles size={48} className="text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-display font-black text-slate-800">FinSerenity</h1>
            <p className="text-slate-500 font-medium">Tu camino hacia la paz financiera comienza aquí.</p>
          </div>
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={loginWithGoogle}
            className="w-full max-w-sm py-5 bg-primary text-white rounded-[24px] font-bold text-lg shadow-2xl shadow-primary/30 flex items-center justify-center gap-3"
          >
            <User size={24} /> Iniciar con Google
          </motion.button>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto flex flex-col pb-32">
        
        {/* Navigation Router */}
        <AnimatePresence mode="wait">
          {currentView === 'inicio' && (
            <motion.div 
              key="inicio"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-8 p-5 pt-8"
            >
              {/* Header */}
              <div className="flex justify-between items-center h-16">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-primary/20">
                    <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
                  </div>
                  <span className="text-xl font-display font-extrabold tracking-tight text-primary">FinSerenity</span>
                </div>
                <button className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
                  <Bell className="w-6 h-6 text-slate-500" />
                </button>
              </div>

              {/* Balance */}
              <section className="text-center space-y-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest block font-sans">SALDO TOTAL</span>
                <div className="flex flex-col items-center">
                  <motion.h1 key={stats.total} initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="text-5xl font-display font-bold text-on-surface">
                    ${stats.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </motion.h1>
                  <div className="mt-3 flex items-center gap-1 px-3 py-1 bg-primary/10 rounded-full">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    <span className="text-[11px] font-bold text-primary">+2.4% este mes</span>
                  </div>
                </div>
              </section>

              {/* AI Insight */}
              <section className="glass-card rounded-2xl p-4 border-primary/20 bg-primary/5">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                    <span className="text-xs font-bold text-primary uppercase tracking-wider">AI Insight</span>
                  </div>
                  {!aiInsight && !isAiLoading && (
                    <button onClick={getAiInsight} className="text-[10px] bg-primary text-white px-2 py-1 rounded-md hover:opacity-90 font-bold uppercase transition-all duration-300">Obtener consejo</button>
                  )}
                </div>
                {isAiLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-sm text-slate-400 italic">Analizando tus finanzas...</span>
                  </div>
                ) : (
                  <p className="text-sm italic leading-relaxed text-on-surface-variant">
                    {aiInsight ? `"${aiInsight}"` : "Descubre consejos inteligentes personalizados para tu ahorro."}
                  </p>
                )}
              </section>

              {/* Grid Stats */}
              <div className="grid grid-cols-2 gap-4">
                <StatCard icon={<ArrowDownCircle className="text-emerald-600" />} label="Ingresos" amount={stats.income} color="bg-emerald-100" />
                <StatCard icon={<ArrowUpCircle className="text-rose-600" />} label="Gastos" amount={stats.expenses} color="bg-rose-100" />
              </div>

              {/* Weekly Trends */}
              <section className="glass-card rounded-3xl p-6">
                <div className="flex justify-between items-center mb-6">
                  <div className="space-y-1">
                    <h3 className="text-lg font-display font-bold">Resumen de Flujo</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Análisis de rendimiento</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-primary">
                      {((stats.income / (stats.income + stats.expenses || 1)) * 100).toFixed(0)}% Rentable
                    </p>
                  </div>
                </div>
                
                <div className="space-y-6">
                  {/* Progress Bars for Income vs Expenses */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-emerald-600 uppercase tracking-tighter">Ingresos Ganados</span>
                        <span className="text-on-surface-variant">${stats.income.toLocaleString()}</span>
                      </div>
                      <div className="h-2 w-full bg-background rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${(stats.income / (stats.income + stats.expenses || 1)) * 100}%` }}
                          className="h-full bg-emerald-500 rounded-full"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-rose-500 uppercase tracking-tighter">Gastos (Pérdida)</span>
                        <span className="text-on-surface-variant">${stats.expenses.toLocaleString()}</span>
                      </div>
                      <div className="h-2 w-full bg-background rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${(stats.expenses / (stats.income + stats.expenses || 1)) * 100}%` }}
                          className="h-full bg-rose-500 rounded-full"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-50 dark:border-slate-800">
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl">
                      <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">Eficiencia</p>
                      <p className="text-lg font-display font-bold text-emerald-800 dark:text-emerald-400">
                        +{((stats.income / (stats.income + stats.expenses || 1)) * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/20 rounded-2xl">
                      <p className="text-[10px] font-bold text-rose-600 uppercase mb-1">Retención</p>
                      <p className="text-lg font-display font-bold text-rose-800 dark:text-rose-400">
                        -{((stats.expenses / (stats.income + stats.expenses || 1)) * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-background rounded-2xl border border-slate-100 dark:border-slate-800 italic text-xs text-on-surface-variant leading-relaxed">
                    <Sparkles size={14} className="inline mr-2 text-primary" />
                    Tu balance actual sugiere que estás {stats.income > stats.expenses ? 'conservando' : 'gastando'} el <b>{Math.abs(((stats.income - stats.expenses) / (stats.income || 1)) * 100).toFixed(0)}%</b> de lo que ingresas.
                  </div>
                </div>
              </section>

              {/* Transactions List */}
              <section className="space-y-4">
                <div className="flex justify-between items-center px-1">
                  <h3 className="text-lg font-display font-bold">Transacciones Recientes</h3>
                  <button onClick={() => setCurrentView('historial')} className="text-primary text-xs font-bold hover:underline transition-all">Ver Todo</button>
                </div>
                <div className="space-y-3">
                  {transactions.slice(0, 3).map(tx => <TxRow key={tx.id} tx={tx} />)}
                </div>
              </section>
            </motion.div>
          )}

          {currentView === 'metas' && (
            <motion.div 
              key="metas"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-5 pt-8 space-y-8"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setCurrentView('inicio')} className="p-2 hover:bg-slate-100 rounded-xl transition-colors"><ChevronLeft /></button>
                <h1 className="text-3xl font-display font-bold bg-gradient-to-r from-emerald-800 to-emerald-500 bg-clip-text text-transparent">Tu Sueños</h1>
              </div>

              <div className="grid gap-6">
                {goals.map(goal => (
                  <motion.div 
                    key={goal.id} 
                    whileHover={{ y: -4 }}
                    className="glass-card rounded-[32px] p-6 space-y-5 shadow-xl shadow-emerald-900/5 relative group"
                  >
                    <button 
                      onClick={() => {
                        if (user) {
                          deleteDoc(doc(db, 'users', user.uid, 'goals', String(goal.id)))
                            .catch(e => handleFirestoreError(e, OperationType.DELETE, `users/${user.uid}/goals/${goal.id}`));
                        }
                      }}
                      className="absolute top-4 right-4 p-1.5 bg-rose-50 text-rose-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-100"
                    >
                      <X size={14} />
                    </button>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-4">
                          <div className="p-3.5 bg-white rounded-2xl shadow-sm border border-slate-50">
                            {goal.iconType === 'car' ? <Car className="text-secondary" /> : 
                             goal.iconType === 'house' ? <Shield className="text-secondary" /> : 
                             goal.iconType === 'star' ? <Sparkles className="text-secondary" /> : 
                             <Target className="text-secondary" />}
                          </div>
                        <div>
                          <h4 className="font-bold text-lg text-slate-800">{goal.title}</h4>
                          <p className="text-xs font-medium text-slate-400">Objetivo: <span className="text-slate-600">${goal.target.toLocaleString()}</span></p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-display font-bold text-primary">{goal.target > 0 ? Math.round((goal.current / goal.target) * 100) : 0}%</p>
                        <p className="text-[10px] uppercase font-bold text-on-surface-variant/40 tracking-widest">Completado</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                       <div className="h-3 w-full bg-background rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }} 
                          animate={{ width: `${(goal.current / goal.target) * 100}%` }} 
                          transition={{ duration: 1.5, ease: "easeOut" }}
                          className={`h-full ${goal.color} rounded-full shadow-[0_0_8px_rgba(0,0,0,0.1)]`} 
                        />
                      </div>
                      <div className="flex justify-between text-[10px] font-bold text-on-surface-variant uppercase">
                        <span>Ahorrado: ${goal.current.toLocaleString()}</span>
                        <span>Faltan: ${(goal.target - goal.current).toLocaleString()}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <button 
                onClick={() => setIsAddingGoal(true)}
                className="w-full py-6 border-2 border-dashed border-slate-200 rounded-[32px] flex items-center justify-center gap-3 text-slate-400 font-bold hover:border-primary hover:text-primary hover:bg-emerald-50/30 transition-all duration-300 group"
              >
                <PlusCircle className="group-hover:rotate-90 transition-transform duration-300" /> Nueva Meta de Ahorro
              </button>
            </motion.div>
          )}

          {currentView === 'ajustes' && (
            <motion.div 
              key="ajustes"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="p-5 pt-8 space-y-8"
            >
              <h1 className="text-3xl font-display font-bold">Configuración</h1>
              
              <div className="flex flex-col items-center gap-4 p-8 glass-card rounded-[40px] shadow-2xl shadow-emerald-900/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-2xl" />
                <div className="relative">
                  <img src={profileImage} className="w-24 h-24 rounded-full border-4 border-white shadow-2xl object-cover" />
                  <motion.button 
                    whileHover={{ scale: 1.1 }} 
                    onClick={() => setIsEditingProfile(true)}
                    className="absolute bottom-1 right-1 p-2 bg-primary text-white rounded-full shadow-lg border-2 border-white"
                  >
                    <Plus size={18} />
                  </motion.button>
                </div>
                <div className="text-center relative z-10">
                  <h3 className="text-2xl font-display font-bold text-slate-800">{userName}</h3>
                  <p className="text-sm font-medium text-slate-400">{userName.toLowerCase().replace(" ", ".")}@vision.finance</p>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-[0.2em] px-4">Centro de Control</p>
                <div className="bg-surface rounded-[32px] overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm">
                  <SettingsItem 
                    icon={<User size={20}/>} 
                    label="Configuración de Perfil" 
                    onClick={() => setIsEditingProfile(true)}
                  />
                  <SettingsItem 
                    icon={isDarkMode ? <Sun size={20}/> : <Moon size={20}/>} 
                    label={isDarkMode ? "Modo Claro" : "Modo Oscuro"} 
                    onClick={() => setIsDarkMode(!isDarkMode)}
                  />
                  <SettingsItem icon={<Bell size={20}/>} label="Alertas y Notificaciones" />
                  <SettingsItem icon={<Shield size={20}/>} label="Seguridad Biométrica" />
                  <SettingsItem icon={<Palette size={20}/>} label="Personalizar Tema Zen" />
                </div>
                
                  <motion.button 
                    whileTap={{ scale: 0.98 }}
                    onClick={logout}
                    className="w-full p-6 mt-6 text-rose-500 font-bold flex items-center justify-center gap-3 bg-surface border border-rose-100 dark:border-rose-950/30 rounded-[32px] hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors shadow-sm"
                  >
                    <LogOut size={20} /> Cerrar Sesión Segura
                  </motion.button>
              </div>
            </motion.div>
          )}

          {currentView === 'historial' && (
            <motion.div 
              key="historial"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              className="p-5 pt-8 space-y-6"
            >
              <div className="flex items-center gap-4 sticky top-0 py-2 bg-background z-10">
                <button onClick={() => setCurrentView('inicio')} className="p-3 hover:bg-white rounded-2xl shadow-sm transition-all"><ChevronLeft /></button>
                <h1 className="text-2xl font-display font-bold">Historial Completo</h1>
              </div>
              <div className="space-y-3">
                {transactions.map(tx => <TxRow key={tx.id} tx={tx} />)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modals Container */}
        <AnimatePresence>
          {isAdding && (
            <Modal title="Registrar Movimiento" onClose={() => setIsAdding(false)}>
              <form onSubmit={handleAddTransaction} className="space-y-6">
                <Input name="name" label="Concepto / Comercio" placeholder="Ej: Starbucks" required />
                <div className="grid grid-cols-2 gap-5">
                  <Input name="amount" label="Importe ($)" type="number" step="0.01" required />
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase px-1">Categoría</label>
                    <select name="type" className="w-full p-4.5 bg-slate-50 rounded-2xl border-2 border-transparent outline-none focus:border-primary/30 focus:bg-white transition-all font-bold text-slate-700">
                      <option value="expense">📉 Gasto</option>
                      <option value="income">📈 Ingreso</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-400 uppercase px-1">Icono representativo</label>
                  <div className="grid grid-cols-4 gap-3">
                    {Object.keys(CATEGORY_MAP).map(cat => (
                      <CategoryRadio key={cat} value={cat} icon={(CATEGORY_MAP as any)[cat].icon} />
                    ))}
                  </div>
                </div>
                <SubmitButton label="Guardar Transacción" />
              </form>
            </Modal>
          )}

          {isAddingGoal && (
            <Modal title="Plantear Nueva Meta" onClose={() => setIsAddingGoal(false)}>
              <form onSubmit={handleAddGoal} className="space-y-6">
                <Input name="title" label="¿Qué quieres conseguir?" placeholder="Ej: Viaje a París" required />
                <Input name="target" label="Meta de ahorro ($)" type="number" step="10" required />
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase px-1">Color distintivo</label>
                    <select name="color" className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none font-semibold">
                      <option value="bg-primary">Verde (Crecimiento)</option>
                      <option value="bg-blue-500">Azul (Estabilidad)</option>
                      <option value="bg-purple-500">Púrpura (Premium)</option>
                      <option value="bg-orange-500">Naranja (Energía)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase px-1">Icono</label>
                    <select name="icon" className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none font-semibold">
                      <option value="target">🎯 Objetivo</option>
                      <option value="car">🚗 Vehículo</option>
                      <option value="house">🏠 Hogar</option>
                      <option value="star">✨ Especial</option>
                    </select>
                  </div>
                </div>

                <SubmitButton label="Comenzar Ahorro" />
              </form>
            </Modal>
          )}

          {isEditingProfile && (
            <Modal title="Editar Perfil" onClose={() => setIsEditingProfile(false)}>
              <div className="space-y-8">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative group">
                    <img src={profileImage} className="w-32 h-32 rounded-full border-4 border-slate-50 shadow-xl object-cover" />
                    <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-all">
                      <Camera size={24} />
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setProfileImage(reader.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Toca para cambiar foto</p>
                </div>

                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!user) return;
                  const formData = new FormData(e.currentTarget);
                  const newName = formData.get('name') as string;
                  
                  const path = `users/${user.uid}`;
                  try {
                    await updateDoc(doc(db, path), {
                      userName: newName,
                      profileImage: profileImage
                    });
                    setUserName(newName);
                    setIsEditingProfile(false);
                  } catch (err) {
                    handleFirestoreError(err, OperationType.WRITE, path);
                  }
                }} className="space-y-6">
                  <Input 
                    name="name" 
                    label="Nombre Completo" 
                    defaultValue={userName} 
                    required 
                  />
                  <div className="pt-4">
                    <SubmitButton label="Actualizar Perfil" />
                  </div>
                </form>
              </div>
            </Modal>
          )}
        </AnimatePresence>

        {/* Improved Floating Bottom Nav */}
        <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-lg px-4 py-3 pb-4 bg-emerald-900/90 backdrop-blur-2xl rounded-[32px] shadow-[0_20px_50px_rgba(6,78,59,0.3)] z-40 flex justify-around items-center border border-emerald-800/50">
          <NavButton icon={<LayoutGrid size={22} />} label="Inicio" active={currentView === 'inicio'} onClick={() => setCurrentView('inicio')} />
          <NavButton icon={<PlusCircle size={22} />} label="Registro" onClick={() => setIsAdding(true)} />
          <NavButton icon={<Target size={22} />} label="Metas" active={currentView === 'metas'} onClick={() => setCurrentView('metas')} />
          <NavButton icon={<Settings size={22} />} label="Ajustes" active={currentView === 'ajustes'} onClick={() => setCurrentView('ajustes')} />
        </nav>
      </div>
      )}
    </div>
  );
}

// Subcomponents
function NavButton({ icon, label, active = false, onClick }: any) {
  return (
    <button 
      onClick={onClick} 
      className={`flex flex-col items-center justify-center px-4 py-2 rounded-2xl transition-all duration-500 relative ${active ? 'text-white' : 'text-emerald-500/60 hover:text-emerald-300'}`}
    >
      {active && <motion.div layoutId="nav-pill" className="absolute inset-0 bg-primary rounded-2xl -z-10 shadow-lg shadow-emerald-400/20" />}
      <div className={`${active ? 'scale-110' : 'scale-100'} transition-transform duration-300`}>{icon}</div>
      <span className={`text-[9px] font-bold mt-1.5 uppercase tracking-wider ${active ? 'opacity-100' : 'opacity-60'}`}>{label}</span>
    </button>
  );
}

function TxRow({ tx }: { tx: Transaction, key?: React.Key }) {
  const cat = (CATEGORY_MAP as any)[tx.category];
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center justify-between p-4.5 bg-surface rounded-[24px] border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow group">
      <div className="flex items-center gap-4">
        <div className={`w-13 h-13 rounded-2xl ${cat.bgColor} dark:bg-slate-800 flex items-center justify-center text-primary group-hover:scale-110 transition-transform`}>{cat.icon}</div>
        <div>
          <p className="font-bold text-on-surface text-sm">{tx.name}</p>
          <p className="text-[11px] font-medium text-on-surface-variant tracking-wide mt-0.5">
            {tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleString() : 'Recientemente'}
          </p>
        </div>
      </div>
      <p className={`font-display font-bold text-lg ${tx.amount < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
        {tx.amount < 0 ? '-' : '+'}${Math.abs(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </p>
    </motion.div>
  );
}

function Modal({ children, title, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }} className="relative bg-surface w-full max-w-lg rounded-t-[40px] sm:rounded-[40px] p-8 shadow-2xl overflow-hidden">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-display font-black text-on-surface">{title}</h2>
          <button onClick={onClose} className="p-3 bg-background hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-colors"><X size={20} className="text-on-surface-variant" /></button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

function Input({ label, ...props }: any) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-bold text-on-surface-variant uppercase px-2 tracking-widest">{label}</label>
      <input {...props} className="w-full p-4.5 bg-background border-2 border-transparent rounded-[20px] focus:ring-4 focus:ring-primary/10 focus:border-primary/30 focus:bg-surface outline-none transition-all font-bold text-on-surface" />
    </div>
  );
}

function CategoryRadio({ value, icon }: any) {
  return (
    <label className="cursor-pointer group relative">
      <input type="radio" name="category" value={value} className="peer hidden" defaultChecked={value === 'other'} />
      <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-background border-2 border-transparent peer-checked:bg-surface peer-checked:border-primary peer-checked:shadow-xl transition-all duration-300">
        {icon}
      </div>
    </label>
  );
}

function SubmitButton({ label }: any) {
  return (
    <motion.button 
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      type="submit" 
      className="w-full py-5.5 bg-primary text-white rounded-[24px] font-bold text-lg shadow-xl shadow-primary/30 hover:opacity-90 transition-all flex items-center justify-center gap-3 mt-4"
    >
      <Plus size={24} /> {label}
    </motion.button>
  );
}

function SettingsItem({ icon, label, onClick }: any) {
  return (
    <div 
      onClick={onClick}
      className="flex items-center justify-between p-6 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-all group first:border-b last:border-t border-slate-50 dark:border-slate-800"
    >
      <div className="flex items-center gap-5">
        <div className="text-on-surface-variant group-hover:text-primary transition-colors">{icon}</div>
        <span className="font-bold text-on-surface tracking-tight">{label}</span>
      </div>
      <ChevronRight size={18} className="text-outline group-hover:text-primary transition-all group-hover:translate-x-1" />
    </div>
  );
}

function StatCard({ icon, label, amount, color }: { icon: React.ReactNode, label: string, amount: number, color: string }) {
  return (
    <motion.div whileHover={{ y: -2 }} className="glass-card rounded-2xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-lg ${color} dark:bg-opacity-20 flex items-center justify-center shadow-sm`}>
          {icon}
        </div>
        <span className="text-xs font-semibold text-on-surface-variant">{label}</span>
      </div>
      <motion.p key={amount} animate={{ scale: [1, 1.05, 1] }} className="text-2xl font-display font-bold text-on-surface">
        ${amount.toLocaleString()}
      </motion.p>
    </motion.div>
  );
}


