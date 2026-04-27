/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PieChart, 
  CheckCircle2, 
  Circle, 
  ChefHat, 
  Clock, 
  RefreshCw,
  AlertCircle,
  Settings,
  Plus,
  Trash2,
  Edit2,
  Save,
  X,
  ArrowUp,
  ArrowDown
} from 'lucide-react';

// Firebase imports
import { 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  deleteDoc, 
  updateDoc,
  getDocs,
  writeBatch,
  getDocFromServer,
  where
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { db, auth } from './firebase';

// Types
interface Produto {
  id: number;
  nome: string;
  centroManha: number[];
  centroTarde: number[];
  sabugo: number[];
  lages: number[];
  ordem?: number;
  docId?: string; // Firestore document ID
}

interface MemoriaAcao {
  produzir: boolean;
  separar: boolean;
}

// Error handling helper
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo?: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    }
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  
  if (errInfo.error.includes('the client is offline')) {
    console.error("Erro de conexão: Verifique a configuração do Firebase.");
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState('Centro');
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [producaoStatus, setProducaoStatus] = useState<Record<string, MemoriaAcao>>({});
  const [dataSinc, setDataSinc] = useState(new Date().toLocaleDateString('pt-BR'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Admin state
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const isAdminUser = useMemo(() => {
    return user?.email === 'humbertosvalente@gmail.com';
  }, [user]);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [isEditing, setIsEditing] = useState<Produto | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState<Partial<Produto>>({
    nome: '',
    centroManha: [0, 0, 0, 0, 0, 0, 0],
    centroTarde: [0, 0, 0, 0, 0, 0, 0],
    sabugo: [0, 0, 0, 0, 0, 0, 0],
    lages: [0, 0, 0, 0, 0, 0, 0]
  });

  const [isSeeding, setIsSeeding] = useState(false);

  useEffect(() => {
    // Auth Listener
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });

    return () => unsubAuth();
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    // 1. Listen to Products
    const qProdutos = query(collection(db, 'produtos'), orderBy('ordem', 'asc'));
    const unsubProdutos = onSnapshot(qProdutos, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ 
        ...doc.data(), 
        docId: doc.id 
      } as Produto));
      
      if (docs.length === 0 && !isSeeding) {
        setIsSeeding(true);
        seedInitialData()
          .then(() => setIsSeeding(false))
          .catch((err) => {
            setIsSeeding(false);
            setLoading(false);
            setError("Falha ao inicializar dados.");
          });
      } else {
        setProdutos(docs);
        setLoading(false);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'produtos');
      if (err.message.includes('permission-denied')) {
        setError('Acesso negado. Você não tem permissão para ver estes dados.');
      } else {
        setError('Erro ao carregar produtos do banco de dados');
      }
      setLoading(false);
    });

    // 2. Listen to Production Status for Today
    const hojeStr = new Date().toLocaleDateString('pt-BR');
    const qProducao = query(collection(db, 'producao'), where('data', '==', hojeStr));
    
    const unsubProducao = onSnapshot(qProducao, (snapshot) => {
      const status: Record<string, MemoriaAcao> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const key = `${data.secaoId}_${data.produtoId}`;
        status[key] = { produzir: data.produzir || false, separar: data.separar || false };
      });
      setProducaoStatus(status);
      setDataSinc(new Date().toLocaleTimeString('pt-BR'));
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'producao');
    });

    return () => {
      unsubProdutos();
      unsubProducao();
    };
  }, [authLoading]); // Run when auth state is ready, regardless of user presence

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Erro ao fazer login:", err);
      setError("Falha na autenticação com o Google.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setProdutos([]);
      setProducaoStatus({});
    } catch (err) {
      console.error("Erro ao sair:", err);
    }
  };

  const seedInitialData = async () => {
    try {
      const initialProducts = [
        { id: 1, nome: "Empadão", centroManha: [1, 5, 5, 5, 6, 6, 5], centroTarde: [0, 0, 0, 0, 0, 1, 1], sabugo: [1, 1, 1, 1, 1, 1, 1], lages: [0, 2, 2, 2, 2, 2, 2], ordem: 1 },
        { id: 2, nome: "Torta Salgada (pão de forma)", centroManha: [0, 1, 1, 1, 1, 1, 1], centroTarde: [0, 0, 0, 0, 0, 0, 0], sabugo: [0, 1, 1, 1, 1, 1, 1], lages: [0, 1, 1, 1, 1, 1, 1], ordem: 2 },
        { id: 3, nome: "Lasanha de Carne", centroManha: [0, 1, 1, 1, 1, 1, 1], centroTarde: [0, 0, 0, 0, 1, 0, 0], sabugo: [0, 0, 0, 1, 0, 0, 0], lages: [0, 1, 0, 1, 0, 1, 0], ordem: 3 },
        { id: 4, nome: "Lasanha de Frango", centroManha: [0, 1, 1, 1, 1, 1, 1], centroTarde: [0, 0, 0, 0, 0, 1, 0], sabugo: [0, 0, 0, 0, 0, 1, 0], lages: [0, 0, 1, 0, 1, 0, 1], ordem: 4 },
        { id: 5, nome: "Panqueca Carne", centroManha: [0, 1, 1, 1, 1, 1, 1], centroTarde: [0, 1, 0, 0, 0, 0, 0], sabugo: [0, 0, 0, 0, 0, 1, 0], lages: [0, 0, 1, 0, 1, 0, 0], ordem: 5 },
        { id: 6, nome: "Panqueca Frango", centroManha: [0, 1, 1, 1, 1, 1, 1], centroTarde: [0, 0, 0, 0, 0, 0, 0], sabugo: [0, 0, 0, 0, 1, 0, 0], lages: [0, 1, 0, 0, 0, 1, 0], ordem: 6 },
        { id: 7, nome: "Misto de Forno", centroManha: [0, 1, 1, 1, 1, 1, 1], centroTarde: [0, 0, 0, 0, 0, 0, 0], sabugo: [0, 0, 0, 0, 0, 0, 0], lages: [0, 0, 0, 1, 0, 0, 1], ordem: 7 },
        { id: 8, nome: "Escondidinho Carne", centroManha: [0, 1, 1, 1, 1, 1, 1], centroTarde: [0, 0, 0, 0, 1, 0, 0], sabugo: [0, 0, 0, 0, 0, 0, 1], lages: [0, 0, 1, 0, 1, 0, 0], ordem: 8 },
        { id: 9, nome: "Torta Napolitana", centroManha: [0, 1, 1, 1, 1, 1, 1], centroTarde: [0, 0, 1, 0, 0, 1, 0], sabugo: [0, 0, 0, 0, 0, 0, 0], lages: [0, 1, 0, 0, 1, 0, 0], ordem: 9 },
        { id: 10, nome: "Torta Frango", centroManha: [0, 1, 1, 1, 1, 1, 1], centroTarde: [0, 0, 0, 1, 0, 0, 0], sabugo: [0, 0, 0, 0, 0, 0, 0], lages: [0, 0, 1, 0, 0, 1, 0], ordem: 10 },
        { id: 11, nome: "Torta Alho Poró", centroManha: [0, 1, 1, 1, 1, 1, 1], centroTarde: [0, 0, 0, 0, 0, 0, 0], sabugo: [0, 0, 0, 0, 0, 0, 0], lages: [0, 0, 0, 0, 0, 0, 0], ordem: 11 }
      ];

      const batch = writeBatch(db);
      initialProducts.forEach(p => {
        const docRef = doc(collection(db, 'produtos'));
        batch.set(docRef, p);
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'produtos/seed');
    }
  };

  const handleAcao = async (secaoId: string, produtoId: number, tipoAcao: 'produzir' | 'separar') => {
    const hoje = new Date().toLocaleDateString('pt-BR');
    const docId = `${secaoId}_${produtoId}_${hoje.replace(/\//g, '-')}`;
    const docRef = doc(db, 'producao', docId);
    
    const currentStatus = producaoStatus[`${secaoId}_${produtoId}`] || { produzir: false, separar: false };
    const novoValor = !currentStatus[tipoAcao];

    try {
      await setDoc(docRef, {
        secaoId,
        produtoId,
        data: hoje,
        [tipoAcao]: novoValor
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `producao/${docId}`);
    }
  };

  const getStatus = (secaoId: string, produtoId: number) => {
    return producaoStatus[`${secaoId}_${produtoId}`] || { produzir: false, separar: false };
  };

  const getQuantidadeHoje = (produto: Produto, secaoId: string) => {
    const hoje = new Date().getDay(); // 0 = Domingo, 1 = Segunda...
    switch (secaoId) {
      case 'centro_manha': return produto.centroManha?.[hoje] ?? 0;
      case 'centro_tarde': return produto.centroTarde?.[hoje] ?? 0;
      case 'sabugo_diario': return produto.sabugo?.[hoje] ?? 0;
      case 'lages_diario': return produto.lages?.[hoje] ?? 0;
      default: return 0;
    }
  };

  const getQuantidadeAmanha = (produto: Produto, secaoId: string) => {
    const amanha = (new Date().getDay() + 1) % 7;
    switch (secaoId) {
      case 'sabugo_diario': return produto.sabugo?.[amanha] ?? 0;
      case 'lages_diario': return produto.lages?.[amanha] ?? 0;
      default: return 0;
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">
            Carregando Painel...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center border border-red-100">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Ops! Algo deu errado</h2>
          <p className="text-slate-600 mb-6">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  const tabs = ['Centro', 'Sabugo', 'Lages', 'Gerenciamento'];

  const secoes = [
    { id: 'centro_manha', label: 'Centro (Manhã)', icon: <Clock className="w-5 h-5" />, tab: 'Centro' },
    { id: 'centro_tarde', label: 'Centro (Tarde)', icon: <Clock className="w-5 h-5" />, tab: 'Centro' },
    { id: 'sabugo_diario', label: 'Sabugo', icon: <PieChart className="w-5 h-5" />, tab: 'Sabugo' },
    { id: 'lages_diario', label: 'Lages', icon: <PieChart className="w-5 h-5" />, tab: 'Lages' },
  ].filter(s => s.tab === activeTab);

  const handleSaveProduct = async () => {
    if (!formData.nome) return;

    try {
      if (isAdding) {
        const maxId = produtos.length > 0 ? Math.max(...produtos.map(p => p.id)) + 1 : 1;
        const maxOrdem = produtos.length > 0 ? Math.max(...produtos.map(p => p.ordem || 0)) + 1 : 1;
        
        await setDoc(doc(collection(db, 'produtos')), {
          ...formData,
          id: maxId,
          ordem: maxOrdem
        });
      } else if (isEditing && isEditing.docId) {
        await updateDoc(doc(db, 'produtos', isEditing.docId), formData);
      }
      setIsAdding(false);
      setIsEditing(null);
      setFormData({
        nome: '',
        centroManha: [0, 0, 0, 0, 0, 0, 0],
        centroTarde: [0, 0, 0, 0, 0, 0, 0],
        sabugo: [0, 0, 0, 0, 0, 0, 0],
        lages: [0, 0, 0, 0, 0, 0, 0]
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'produtos');
    }
  };

  const handleDeleteProduct = async (produto: Produto) => {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;
    if (!produto.docId) return;

    try {
      await deleteDoc(doc(db, 'produtos', produto.docId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `produtos/${produto.docId}`);
    }
  };

  const handleEditClick = (produto: Produto) => {
    setIsEditing(produto);
    setFormData({
      nome: produto.nome,
      centroManha: produto.centroManha,
      centroTarde: produto.centroTarde,
      sabugo: produto.sabugo,
      lages: produto.lages
    });
    setIsAdding(false);
  };

  const handleMove = async (id: number, direction: 'up' | 'down') => {
    const index = produtos.findIndex(p => p.id === id);
    if (index === -1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= produtos.length) return;

    const p1 = produtos[index];
    const p2 = produtos[targetIndex];

    if (!p1.docId || !p2.docId) return;

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'produtos', p1.docId), { ordem: p2.ordem });
      batch.update(doc(db, 'produtos', p2.docId), { ordem: p1.ordem });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'produtos/reorder');
    }
  };

  const handleAddClick = () => {
    setIsAdding(true);
    setIsEditing(null);
    setFormData({
      nome: '',
      centroManha: [0, 0, 0, 0, 0, 0, 0],
      centroTarde: [0, 0, 0, 0, 0, 0, 0],
      sabugo: [0, 0, 0, 0, 0, 0, 0],
      lages: [0, 0, 0, 0, 0, 0, 0]
    });
  };

  const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === '12345') {
      setIsAdminAuthenticated(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
      setPasswordInput('');
    }
  };

  const renderAdmin = () => {
    if (!isAdminAuthenticated && !isAdminUser) {
      return (
        <div className="flex items-center justify-center py-12">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-200 w-full max-w-md text-center"
          >
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Settings className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 uppercase mb-2">Acesso Restrito</h2>
            <p className="text-slate-500 font-medium mb-8">Insira a senha para gerenciar os produtos</p>
            
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="relative">
                <input 
                  type="password" 
                  inputMode="numeric"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Senha de acesso"
                  className={`w-full bg-slate-50 border ${passwordError ? 'border-red-500 ring-2 ring-red-100' : 'border-slate-200'} p-4 rounded-2xl font-bold text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all`}
                  autoFocus
                />
                {passwordError && (
                  <p className="text-red-500 text-xs font-bold uppercase mt-2">Senha incorreta!</p>
                )}
              </div>
              <button 
                type="submit"
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-wider hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
              >
                Entrar no Gerenciamento
              </button>
            </form>
          </motion.div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase">Gerenciar Produtos</h2>
          <p className="text-slate-500 font-medium">Adicione, edite ou remova produtos e quantidades</p>
        </div>
        <button 
          onClick={handleAddClick}
          className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
        >
          <Plus className="w-5 h-5" />
          Novo Produto
        </button>
      </div>

      {(isAdding || isEditing) && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-6 rounded-3xl shadow-xl border-2 border-indigo-100"
        >
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-black text-slate-900 uppercase">
              {isAdding ? 'Novo Produto' : `Editando: ${isEditing?.nome}`}
            </h3>
            <button onClick={() => { setIsAdding(false); setIsEditing(null); }} className="text-slate-400 hover:text-red-500 transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase mb-2">Nome do Produto</label>
              <input 
                type="text" 
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="Ex: Empadão de Frango"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { id: 'centroManha', label: 'Centro Manhã' },
                { id: 'centroTarde', label: 'Centro Tarde' },
                { id: 'sabugo', label: 'Sabugo' },
                { id: 'lages', label: 'Lages' }
              ].map((secao) => (
                <div key={secao.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <label className="block text-xs font-black text-slate-400 uppercase mb-3">{secao.label}</label>
                  <div className="grid grid-cols-7 gap-1 md:gap-2">
                    {diasSemana.map((dia, idx) => (
                      <div key={dia} className="flex flex-col items-center gap-1">
                        <span className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase">{dia}</span>
                        <input 
                          type="number" 
                          inputMode="numeric"
                          min="0"
                          value={formData[secao.id as keyof typeof formData] ? (formData[secao.id as keyof typeof formData] as number[])[idx] : 0}
                          onChange={(e) => {
                            const newVal = parseInt(e.target.value) || 0;
                            const currentArray = [...(formData[secao.id as keyof typeof formData] as number[])];
                            currentArray[idx] = newVal;
                            setFormData({ ...formData, [secao.id]: currentArray });
                          }}
                          className="w-full bg-white border border-slate-200 py-2 px-1 md:p-2 rounded-lg text-center text-sm md:text-base font-bold text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-4 pt-4">
              <button 
                onClick={handleSaveProduct}
                className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-wider hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
              >
                <Save className="w-5 h-5" />
                Salvar Alterações
              </button>
              <button 
                onClick={() => { setIsAdding(false); setIsEditing(null); }}
                className="px-8 bg-slate-100 text-slate-500 py-4 rounded-2xl font-black uppercase tracking-wider hover:bg-slate-200 transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {produtos.map((produto) => (
          <div key={produto.docId || produto.id} className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-indigo-200 transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-all">
                <PieChart className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800 uppercase">{produto.nome}</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">ID: #{produto.id}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-1 mr-2">
                <button 
                  onClick={() => handleMove(produto.id, 'up')}
                  disabled={produtos.indexOf(produto) === 0}
                  className="p-1.5 bg-slate-50 text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleMove(produto.id, 'down')}
                  disabled={produtos.indexOf(produto) === produtos.length - 1}
                  className="p-1.5 bg-slate-50 text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
              </div>
              <button 
                onClick={() => handleEditClick(produto)}
                className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 transition-all border border-transparent hover:border-indigo-100"
                title="Editar"
              >
                <Edit2 className="w-5 h-5" />
              </button>
              <button 
                onClick={() => handleDeleteProduct(produto)}
                className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-red-50 hover:text-red-500 transition-all border border-transparent hover:border-red-100"
                title="Excluir"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F1F5F9] text-slate-900 font-sans p-3 md:p-8">
      <header className="max-w-7xl mx-auto mb-6 md:mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg text-white shrink-0">
              <ChefHat className="w-5 h-5 md:w-6 md:h-6" />
            </div>
            <div>
              <h1 className="text-xl md:text-3xl font-black tracking-tight text-slate-900 uppercase leading-tight">
                Painel <span className="text-indigo-600">Tortas</span>
              </h1>
              <p className="text-slate-500 text-xs md:text-sm font-medium flex items-center gap-1.5 mt-0.5">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                Sincronizado: {dataSinc}
              </p>
            </div>
          </div>
          
          <div className="flex gap-2 self-start md:self-auto items-center">
            <div className="bg-white px-3 py-1.5 md:px-4 md:py-2 rounded-xl shadow-sm border border-slate-200 flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
              <span className="text-[10px] md:text-sm font-bold text-slate-700 uppercase">Produzir</span>
            </div>
            {user ? (
              <button 
                onClick={handleLogout}
                className="p-2 bg-white text-slate-400 hover:text-red-500 rounded-xl border border-slate-200 shadow-sm transition-all"
                title="Sair"
              >
                <X className="w-5 h-5" />
              </button>
            ) : (
              <button 
                onClick={handleLogin}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
              >
                Admin Login
              </button>
            )}
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-200 w-full md:w-fit overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`
                relative flex-1 md:flex-none px-4 md:px-8 py-2 md:py-2.5 rounded-xl text-[11px] md:text-sm font-black uppercase tracking-wider transition-all whitespace-nowrap
                ${activeTab === tab ? 'text-white' : 'text-slate-400 hover:text-slate-600'}
              `}
            >
              {activeTab === tab && (
                <motion.div 
                  layoutId="activeTab"
                  className="absolute inset-0 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-200"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10">{tab}</span>
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          <motion.div 
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >
            {activeTab === 'Centro' ? (
              <motion.section 
                className="bg-white rounded-[1.5rem] md:rounded-[2rem] shadow-xl shadow-slate-200/60 overflow-hidden border border-slate-100"
              >
                <div className="bg-slate-900 p-4 md:p-6 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="p-1.5 md:p-2 bg-slate-800 rounded-lg text-indigo-400">
                      <Clock className="w-5 h-5 md:w-6 md:h-6" />
                    </div>
                    <h2 className="text-sm md:text-xl font-black uppercase tracking-wider">Produção Centro</h2>
                  </div>
                </div>

                <div className="p-2 md:p-4 overflow-x-auto">
                  <div className="min-w-[650px] md:min-w-0">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-0 px-4 py-2 mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                      <span>Produto</span>
                      <span className="w-[200px] text-center">Período Manhã</span>
                      <span className="w-[200px] text-center">Período Tarde</span>
                    </div>
                    <AnimatePresence mode="popLayout">
                      {produtos
                        .filter(p => getQuantidadeHoje(p, 'centro_manha') > 0 || getQuantidadeHoje(p, 'centro_tarde') > 0)
                        .map((produto) => {
                        const statusManha = getStatus('centro_manha', produto.id);
                        const statusTarde = getStatus('centro_tarde', produto.id);
                        const qtdManha = getQuantidadeHoje(produto, 'centro_manha');
                        const qtdTarde = getQuantidadeHoje(produto, 'centro_tarde');
                        
                        const isManhaDone = statusManha.produzir || qtdManha === 0;
                        const isTardeDone = statusTarde.produzir || qtdTarde === 0;
                        const isTotalDone = isManhaDone && isTardeDone;
                        
                        const isManhaStruck = statusManha.produzir || (qtdManha === 0 && isTardeDone);
                        const isTardeStruck = statusTarde.produzir || (qtdTarde === 0 && isManhaDone);
                        
                        return (
                          <motion.div 
                            key={produto.docId || produto.id}
                            layout
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="grid grid-cols-[1fr_auto_auto] items-center gap-0 p-0 mb-2 rounded-xl bg-white border border-slate-100 hover:border-indigo-100 transition-all group overflow-hidden"
                          >
                            <div className={`flex-1 p-4 bg-slate-50/50 transition-all ${isTotalDone ? 'opacity-50' : ''}`}>
                              <h3 className={`font-bold text-sm md:text-base text-slate-800 group-hover:text-indigo-600 transition-all ${isTotalDone ? 'line-through decoration-indigo-500 decoration-2' : ''}`}>
                                {produto.nome}
                              </h3>
                            </div>

                            {/* Ações Manhã */}
                            <div className="flex items-center gap-3 w-[200px] justify-center p-4 bg-white border-l border-slate-100">
                              <div className="flex gap-2 flex-1">
                                <button
                                  onClick={() => handleAcao('centro_manha', produto.id, 'produzir')}
                                  className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg font-bold text-[10px] transition-all active:scale-95 ${statusManha.produzir ? 'bg-green-500 text-white shadow-md shadow-green-100' : 'bg-slate-100 text-slate-400 border border-slate-200 hover:border-green-200 hover:text-green-500'}`}
                                >
                                  {statusManha.produzir ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                                  {statusManha.produzir ? 'PRODUZIDO' : 'PRODUZIR'}
                                </button>
                              </div>
                              <div className={`flex flex-col items-center min-w-[40px] transition-all ${isManhaStruck ? 'opacity-30' : ''}`}>
                                <span className="text-[10px] font-black text-slate-400 uppercase">Qtd</span>
                                <span className={`text-lg font-black text-indigo-600 leading-none ${isManhaStruck ? 'line-through' : ''}`}>{qtdManha}</span>
                              </div>
                            </div>

                            {/* Ações Tarde */}
                            <div className="flex items-center gap-3 w-[200px] justify-center p-4 bg-slate-50 border-l-2 border-slate-200">
                              <div className="flex gap-2 flex-1">
                                <button
                                  onClick={() => handleAcao('centro_tarde', produto.id, 'produzir')}
                                  className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg font-bold text-[10px] transition-all active:scale-95 ${statusTarde.produzir ? 'bg-green-500 text-white shadow-md shadow-green-100' : 'bg-slate-100 text-slate-400 border border-slate-200 hover:border-green-200 hover:text-green-500'}`}
                                >
                                  {statusTarde.produzir ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                                  {statusTarde.produzir ? 'PRODUZIDO' : 'PRODUZIR'}
                                </button>
                              </div>
                              <div className={`flex flex-col items-center min-w-[40px] transition-all ${isTardeStruck ? 'opacity-30' : ''}`}>
                                <span className="text-[10px] font-black text-slate-400 uppercase">Qtd</span>
                                <span className={`text-lg font-black text-indigo-600 leading-none ${isTardeStruck ? 'line-through' : ''}`}>{qtdTarde}</span>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.section>
            ) : activeTab === 'Gerenciamento' ? (
              renderAdmin()
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8">
                {secoes.map((secao) => (
                  <motion.section 
                    key={secao.id}
                    className="bg-white rounded-[1.5rem] md:rounded-[2rem] shadow-xl shadow-slate-200/60 overflow-hidden border border-slate-100"
                  >
                    <div className="bg-slate-900 p-4 md:p-6 text-white flex items-center justify-between">
                      <div className="flex items-center gap-2 md:gap-3">
                        <div className="p-1.5 md:p-2 bg-slate-800 rounded-lg text-indigo-400">
                          {secao.icon}
                        </div>
                        <h2 className="text-sm md:text-xl font-black uppercase tracking-wider">{secao.label}</h2>
                      </div>
                    </div>

                    <div className="p-3 md:p-4">
                      <AnimatePresence mode="popLayout">
                        {produtos
                          .filter(p => getQuantidadeHoje(p, secao.id) > 0 || getQuantidadeAmanha(p, secao.id) > 0)
                          .map((produto) => {
                          const status = getStatus(secao.id, produto.id);
                          const qtdHoje = getQuantidadeHoje(produto, secao.id);
                          const qtdAmanha = getQuantidadeAmanha(produto, secao.id);
                          
                          const isDone = status.produzir || (qtdHoje === 0);

                          return (
                            <motion.div 
                              key={produto.docId || produto.id}
                              layout
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="flex flex-col sm:flex-row sm:items-center justify-between p-3 md:p-4 mb-2 md:mb-3 rounded-xl md:rounded-2xl bg-slate-50 border border-slate-100 hover:border-indigo-100 transition-all group gap-3"
                            >
                              <div className={`flex-1 transition-all ${isDone ? 'opacity-50' : ''}`}>
                                <h3 className={`font-bold text-sm md:text-base text-slate-800 group-hover:text-indigo-600 transition-all ${isDone ? 'line-through decoration-indigo-500 decoration-2' : ''}`}>
                                  {produto.nome}
                                </h3>
                              </div>

                              <div className="flex items-center gap-2 md:gap-3">
                                {/* Botão Produzir */}
                                <button
                                  onClick={() => handleAcao(secao.id, produto.id, 'produzir')}
                                  disabled={qtdHoje === 0}
                                  className={`
                                    flex-1 sm:flex-none flex items-center justify-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-2 rounded-lg md:rounded-xl font-bold text-[10px] md:text-sm transition-all active:scale-95
                                    ${status.produzir 
                                      ? 'bg-green-500 text-white shadow-lg shadow-green-200' 
                                      : qtdHoje === 0 
                                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-50'
                                        : 'bg-white text-slate-400 border border-slate-200 hover:border-green-200 hover:text-green-500'}
                                  `}
                                >
                                  {status.produzir ? <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4" /> : <Circle className="w-3.5 h-3.5 md:w-4 md:h-4" />}
                                  <span>{status.produzir ? 'PRODUZIDO' : 'PRODUZIR'}</span>
                                </button>

                                {/* Qtd Hoje */}
                                <div className={`flex flex-col items-center justify-center bg-white w-12 h-12 rounded-xl border border-slate-200 shadow-sm transition-all ${isDone ? 'opacity-30' : ''}`}>
                                  <span className="text-[8px] font-black text-slate-400 uppercase">Hoje</span>
                                  <span className={`text-base font-black text-indigo-600 leading-none ${isDone ? 'line-through' : ''}`}>{qtdHoje}</span>
                                </div>

                                {/* Qtd Amanhã */}
                                <div className={`flex flex-col items-center justify-center bg-slate-100 w-12 h-12 rounded-xl border border-dashed border-slate-300 transition-all`}>
                                  <span className="text-[8px] font-black text-slate-400 uppercase">Amanhã</span>
                                  <span className={`text-base font-black text-slate-500 leading-none`}>{qtdAmanha}</span>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </motion.section>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="max-w-7xl mx-auto mt-12 pb-8 text-center text-slate-400 text-sm font-medium">
        <p>© 2026 API-PAINEL-TORTAS • Sistema de Produção em Tempo Real</p>
      </footer>
    </div>
  );
}
