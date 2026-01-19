'use client';

import React, { useState, useEffect } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, doc, setDoc, onSnapshot, collection, updateDoc, deleteDoc, getDoc, arrayUnion, arrayRemove, getDocs
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  Gem, Crown, User, Info, ChevronRight, ShoppingCart, Lock, Plus, AlertCircle, Play, 
  Share2, CheckCircle2, Link as LinkIcon, Copy, Users, Home
} from 'lucide-react';

// ==================================================================
// [필수] 사용자님의 Firebase 설정값 (기존 유지)
// ==================================================================
const firebaseConfig = {
  apiKey: "AIzaSyBPd5xk9UseJf79GTZogckQmKKwwogneco",
  authDomain: "test-4305d.firebaseapp.com",
  projectId: "test-4305d",
  storageBucket: "test-4305d.firebasestorage.app",
  messagingSenderId: "402376205992",
  appId: "1:402376205992:web:be662592fa4d5f0efb849d"
};

// --- Firebase Init ---
let firebaseApp;
let db;
let auth;

try {
  if (!getApps().length) {
    firebaseApp = initializeApp(firebaseConfig);
  } else {
    firebaseApp = getApps()[0];
  }
  db = getFirestore(firebaseApp);
  auth = getAuth(firebaseApp);
} catch (e) { console.error("Firebase Init Error:", e); }

// --- Game Data & Constants ---
const COLORS = ['white', 'blue', 'green', 'red', 'black']; 
const GEM_STYLE = {
  white: 'bg-slate-100 border-slate-300 text-slate-800',
  blue: 'bg-blue-500 border-blue-700 text-white',
  green: 'bg-emerald-500 border-emerald-700 text-white',
  red: 'bg-rose-500 border-rose-700 text-white',
  black: 'bg-slate-800 border-black text-white',
  gold: 'bg-yellow-400 border-yellow-600 text-yellow-900'
};

const generateCards = () => {
  const cards = [];
  const tiers = [1, 2, 3];
  tiers.forEach(tier => {
    for (let i = 0; i < 20; i++) {
      const bonus = COLORS[Math.floor(Math.random() * 5)];
      const cost = {};
      for(let j=0; j<3; j++) {
        const c = COLORS[Math.floor(Math.random() * 5)];
        cost[c] = (cost[c] || 0) + (tier + Math.floor(Math.random()*2));
      }
      cards.push({
        id: `t${tier}_${i}_${Math.random().toString(36).substr(2,9)}`,
        tier,
        bonus,
        points: tier === 1 ? (Math.random()>0.8 ? 1 : 0) : tier === 2 ? (Math.floor(Math.random()*3)+1) : (Math.floor(Math.random()*3)+3),
        cost
      });
    }
  });
  return cards;
};

const NOBLES = [
  { id: 'n1', points: 3, req: { white: 4, blue: 4, green: 0, red: 0, black: 0 } },
  { id: 'n2', points: 3, req: { white: 0, blue: 0, green: 4, red: 4, black: 0 } },
  { id: 'n3', points: 3, req: { white: 0, blue: 4, green: 4, red: 0, black: 0 } },
  { id: 'n4', points: 3, req: { white: 3, blue: 3, green: 3, red: 0, black: 0 } },
  { id: 'n5', points: 3, req: { white: 0, blue: 0, green: 0, red: 4, black: 4 } },
];

export default function SplendorUXImproved() {
  const [user, setUser] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [roomData, setRoomData] = useState(null);
  const [players, setPlayers] = useState([]);
  
  // UI States
  const [activeCard, setActiveCard] = useState(null);
  const [showGemModal, setShowGemModal] = useState(false);
  const [showOpponent, setShowOpponent] = useState(null);
  const [selectedGems, setSelectedGems] = useState([]);
  const [copyStatus, setCopyStatus] = useState(null);
  const [isInviteMode, setIsInviteMode] = useState(false); // ★ 초대 모드 상태

  // Auth & Sync
  useEffect(() => {
    // 1. URL 파라미터 감지 및 초대 모드 설정
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const code = p.get('room');
      if (code && code.length === 4) {
        setRoomCode(code.toUpperCase());
        setIsInviteMode(true); // ★ 초대 링크로 들어왔음을 표시
      }
    }
    
    if(!auth) return;
    const unsub = onAuthStateChanged(auth, u => {
      if(u) setUser(u);
      else signInAnonymously(auth).catch(console.error);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if(!user || !roomCode || roomCode.length!==4 || !db) return;
    const unsubRoom = onSnapshot(doc(db,'rooms',roomCode), s => {
      if (s.exists()) setRoomData(s.data());
      else setRoomData(null);
    });
    const unsubPlayers = onSnapshot(collection(db,'rooms',roomCode,'players'), s => {
      const list=[]; s.forEach(d=>list.push({id:d.id, ...d.data()}));
      setPlayers(list);
    });
    return () => { unsubRoom(); unsubPlayers(); };
  }, [user, roomCode]);

  // Logic Helpers
  const myData = user ? players.find(p => p.id === user.uid) : null;
  const isMyTurn = roomData?.status === 'playing' && roomData?.turnOrder?.[roomData.turnIndex] === user?.uid;

  const canBuy = (card, player) => {
    if (!player || !player.gems) return false;
    let goldNeeded = 0;
    for (const color of COLORS) {
      const cost = card.cost[color] || 0;
      const myBonus = player.bonuses?.[color] || 0;
      const myGem = player.gems?.[color] || 0;
      const realCost = Math.max(0, cost - myBonus);
      if (myGem < realCost) goldNeeded += (realCost - myGem);
    }
    return (player.gems?.gold || 0) >= goldNeeded;
  };

  // --- Actions ---
  const handleCreate = async () => {
    if(!playerName.trim()) return alert('닉네임을 입력해주세요.');
    const code = Math.random().toString(36).substring(2,6).toUpperCase();
    const allCards = generateCards();
    const board = { 1: allCards.filter(c=>c.tier===1).slice(0,4), 2: allCards.filter(c=>c.tier===2).slice(0,4), 3: allCards.filter(c=>c.tier===3).slice(0,4) };
    const decks = { 1: allCards.filter(c=>c.tier===1).slice(4), 2: allCards.filter(c=>c.tier===2).slice(4), 3: allCards.filter(c=>c.tier===3).slice(4) };

    await setDoc(doc(db,'rooms',code), {
      hostId: user.uid, status: 'lobby', board, decks, 
      bank: { white: 7, blue: 7, green: 7, red: 7, black: 7, gold: 5 },
      nobles: NOBLES.slice(0, 4), turnIndex: 0, turnOrder: []
    });
    await setDoc(doc(db,'rooms',code,'players',user.uid), { 
      name: playerName, score: 0, 
      gems: { white:0, blue:0, green:0, red:0, black:0, gold:0 },
      bonuses: { white:0, blue:0, green:0, red:0, black:0 },
      cards: [], reserved: []
    });
    setRoomCode(code);
    setIsInviteMode(true); // 생성 직후 로비로 갈 때도 초대 모드처럼 UI 유지
  };

  const handleJoin = async () => {
    if(!playerName.trim()) return alert('닉네임을 입력해주세요.');
    
    // ★ [예외 처리] 방 존재 여부 및 인원 체크
    const roomRef = doc(db,'rooms',roomCode);
    const roomSnap = await getDoc(roomRef);
    if(!roomSnap.exists()) return alert('존재하지 않는 방입니다. 코드를 확인해주세요.');
    
    const playersRef = collection(db, 'rooms', roomCode, 'players');
    const playersSnap = await getDocs(playersRef);
    if(playersSnap.size >= 4) return alert('방이 꽉 찼습니다 (최대 4명).');

    // 입장 진행
    await setDoc(doc(db,'rooms',roomCode,'players',user.uid), { 
      name: playerName, score: 0,
      gems: { white:0, blue:0, green:0, red:0, black:0, gold:0 },
      bonuses: { white:0, blue:0, green:0, red:0, black:0 },
      cards: [], reserved: []
    });
  };

  const handleStart = async () => {
    if(players.length < 2) return alert('최소 2명이 필요합니다.');
    const order = players.map(p=>p.id).sort(()=>Math.random()-0.5);
    await updateDoc(doc(db,'rooms',roomCode), { status: 'playing', turnOrder: order, turnIndex: 0 });
  };

  // 링크 복사 (쿼리스트링 초기화 포함)
  const copyInviteLink = () => {
    if (typeof window === 'undefined') return;
    const baseUrl = window.location.href.split('?')[0];
    const inviteUrl = `${baseUrl}?room=${roomCode}`;
    const el = document.createElement('textarea');
    el.value = inviteUrl;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    setCopyStatus('copied');
    setTimeout(() => setCopyStatus(null), 2000);
  };

  const confirmTakeGems = async () => {
    if (!myData) return;
    const counts = {};
    selectedGems.forEach(c => counts[c] = (counts[c]||0)+1);
    const types = Object.keys(counts).length;
    const total = selectedGems.length;
    
    let isValid = false;
    if (total === 3 && types === 3) isValid = true;
    if (total === 2 && types === 1) {
      if (roomData.bank[selectedGems[0]] >= 4) isValid = true;
    }

    if (!isValid) return alert("규칙: 서로 다른 3개 또는 4개 이상 남은 같은 색 2개");

    const newBank = { ...roomData.bank };
    const myNewGems = { ...myData.gems };
    
    selectedGems.forEach(c => { newBank[c]--; myNewGems[c]++; });

    await updateDoc(doc(db, 'rooms', roomCode), { bank: newBank, turnIndex: (roomData.turnIndex + 1) % players.length });
    await updateDoc(doc(db, 'rooms', roomCode, 'players', user.uid), { gems: myNewGems });
    setShowGemModal(false); setSelectedGems([]);
  };

  const buyCard = async (card, fromReserved = false) => {
    if (!myData || !canBuy(card, myData)) return alert("자원이 부족합니다.");

    const payment = {};
    let remainingGoldNeeded = 0;
    
    for (const color of COLORS) {
      const cost = card.cost[color] || 0;
      const bonus = myData.bonuses[color] || 0;
      const realCost = Math.max(0, cost - bonus);
      const myGem = myData.gems[color];
      
      if (myGem >= realCost) payment[color] = realCost;
      else { payment[color] = myGem; remainingGoldNeeded += (realCost - myGem); }
    }

    const newBank = { ...roomData.bank };
    const myNewGems = { ...myData.gems };
    const myNewBonuses = { ...myData.bonuses };
    
    for (const c of COLORS) {
      if (payment[c]) { newBank[c] += payment[c]; myNewGems[c] -= payment[c]; }
    }
    if (remainingGoldNeeded > 0) { newBank.gold += remainingGoldNeeded; myNewGems.gold -= remainingGoldNeeded; }

    myNewBonuses[card.bonus]++;
    const newScore = myData.score + card.points;

    const updates = { bank: newBank, turnIndex: (roomData.turnIndex + 1) % players.length };

    if (!fromReserved) {
      const tierBoard = [...roomData.board[card.tier]];
      const cardIdx = tierBoard.findIndex(c => c.id === card.id);
      const tierDeck = [...roomData.decks[card.tier]];
      const newCard = tierDeck.pop();
      if (newCard) tierBoard[cardIdx] = newCard;
      else tierBoard.splice(cardIdx, 1);
      updates[`board.${card.tier}`] = tierBoard;
      updates[`decks.${card.tier}`] = tierDeck;
    } else {
      await updateDoc(doc(db, 'rooms', roomCode, 'players', user.uid), { reserved: arrayRemove(card) });
    }

    await updateDoc(doc(db, 'rooms', roomCode), updates);
    await updateDoc(doc(db, 'rooms', roomCode, 'players', user.uid), {
      gems: myNewGems, bonuses: myNewBonuses, score: newScore, cards: arrayUnion(card)
    });
    setActiveCard(null);
  };

  const reserveCard = async (card) => {
    if (!myData || myData.reserved.length >= 3) return alert("3장까지만 찜 가능합니다.");
    const updates = { turnIndex: (roomData.turnIndex + 1) % players.length };
    const playerUpdates = { reserved: arrayUnion(card) };
    if (roomData.bank.gold > 0) {
      updates['bank.gold'] = roomData.bank.gold - 1;
      playerUpdates['gems.gold'] = (myData.gems.gold || 0) + 1;
    }
    const tierBoard = [...roomData.board[card.tier]];
    const cardIdx = tierBoard.findIndex(c => c.id === card.id);
    const tierDeck = [...roomData.decks[card.tier]];
    const newCard = tierDeck.pop();
    if (newCard) tierBoard[cardIdx] = newCard;
    else tierBoard.splice(cardIdx, 1);
    updates[`board.${card.tier}`] = tierBoard;
    updates[`decks.${card.tier}`] = tierDeck;

    await updateDoc(doc(db, 'rooms', roomCode), updates);
    await updateDoc(doc(db, 'rooms', roomCode, 'players', user.uid), playerUpdates);
    setActiveCard(null);
  };

  // --- Render ---
  if(!user) return <div className="h-screen flex items-center justify-center bg-slate-900 text-amber-500 font-bold">Connecting...</div>;

  // 1. Lobby & Entrance
  if (!roomData || roomData.status === 'lobby') {
    return (
      <div className="h-screen bg-slate-900 text-white p-6 flex flex-col justify-center max-w-md mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-black text-amber-500 tracking-widest mb-1">SPLENDOR</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest">Mobile Edition</p>
        </div>

        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
           {!user || !players.find(p => p.id === user.uid) ? (
             <div className="space-y-6">
               {isInviteMode ? (
                 // [UX 개선] 초대 모드일 때: 방 정보 강조, 생성 버튼 숨김
                 <div className="text-center bg-slate-900/50 p-4 rounded-xl border border-slate-600">
                   <p className="text-slate-400 text-xs uppercase font-bold mb-1">Invitation to Room</p>
                   <p className="text-3xl font-black text-blue-400 font-mono tracking-wider">{roomCode}</p>
                 </div>
               ) : null}
               
               <div className="space-y-2">
                 <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nickname</label>
                 <input 
                   value={playerName} 
                   onChange={e=>setPlayerName(e.target.value)} 
                   placeholder="닉네임 입력" 
                   className="w-full bg-slate-700 border border-slate-600 focus:border-amber-500 p-4 rounded-xl text-white font-bold outline-none transition-all"
                 />
               </div>
               
               <div className="flex gap-2">
                 <input 
                   value={roomCode} 
                   onChange={e=>setRoomCode(e.target.value.toUpperCase())} 
                   placeholder="방 코드" 
                   disabled={isInviteMode} // 초대 모드면 수정 불가
                   className={`flex-1 bg-slate-700 border border-slate-600 p-4 rounded-xl text-center uppercase font-mono font-bold outline-none ${isInviteMode ? 'opacity-50 cursor-not-allowed' : 'focus:border-amber-500'}`}
                 />
                 <button 
                   onClick={handleJoin} 
                   className="bg-blue-600 hover:bg-blue-500 text-white px-8 rounded-xl font-bold transition-all shadow-lg shadow-blue-900/20"
                 >
                   입장하기
                 </button>
               </div>
               
               {/* 초대 모드가 아닐 때만 '방 만들기' 표시 */}
               {!isInviteMode && (
                 <div className="pt-4 border-t border-slate-700 mt-4">
                   <button onClick={handleCreate} className="w-full bg-slate-700 hover:bg-amber-600 hover:text-white text-slate-300 p-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2">
                     <Plus size={20}/> 새로운 방 만들기
                   </button>
                 </div>
               )}
             </div>
           ) : (
             <div className="space-y-6">
               {/* [UX 개선] 대기실 상단 방 코드 표시 */}
               <div className="flex flex-col items-center justify-center p-5 bg-slate-900 rounded-xl border border-slate-600 relative overflow-hidden group">
                 <div className="absolute inset-0 bg-amber-500/5 group-hover:bg-amber-500/10 transition-colors"></div>
                 <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Room Code</p>
                 <button onClick={copyInviteLink} className="text-4xl font-mono font-black text-amber-500 tracking-widest flex items-center gap-3 hover:scale-105 transition-transform active:scale-95">
                   {roomCode} <Copy size={20} className="opacity-50"/>
                 </button>
                 {copyStatus && <span className="text-xs text-green-400 font-bold mt-2 flex items-center gap-1"><CheckCircle2 size={12}/> 링크 복사 완료</span>}
               </div>

               <div>
                 <div className="flex justify-between items-center mb-2 px-1">
                   <h3 className="font-bold text-slate-400 text-sm uppercase">Participants</h3>
                   <span className="text-xs font-bold text-slate-500 bg-slate-900 px-2 py-0.5 rounded">{players.length} / 4</span>
                 </div>
                 <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                   {players.map(p=>(
                     <div key={p.id} className="flex gap-3 items-center p-3 bg-slate-700/50 border border-slate-700 rounded-xl">
                       <div className={`w-2.5 h-2.5 rounded-full ${p.id === roomData.hostId ? 'bg-amber-500 shadow-[0_0_8px_orange]' : 'bg-green-500'}`}/>
                       <span className="font-bold text-slate-200">{p.name}</span>
                       {p.id === roomData.hostId && <Crown size={14} className="text-amber-500"/>}
                       {p.id === user.uid && <span className="text-[10px] bg-slate-600 px-1.5 py-0.5 rounded text-slate-300">YOU</span>}
                     </div>
                   ))}
                 </div>
               </div>

               {roomData?.hostId === user.uid ? (
                 <button onClick={handleStart} className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white p-4 rounded-xl font-black text-lg shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
                   <Play fill="currentColor" size={20}/> 게임 시작
                 </button>
               ) : (
                 <div className="text-center p-4 bg-slate-700/30 rounded-xl border border-dashed border-slate-600">
                   <p className="text-slate-500 text-sm font-bold animate-pulse">방장의 시작을 기다리는 중...</p>
                 </div>
               )}
             </div>
           )}
        </div>
      </div>
    );
  }

  // ★ [안전장치] 게임 중 데이터 로딩 대기
  if (roomData.status === 'playing' && !myData) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-400 gap-4">
      <div className="w-10 h-10 border-4 border-slate-800 border-t-amber-500 rounded-full animate-spin"></div>
      <p className="text-xs font-bold uppercase tracking-widest">Syncing Player Data...</p>
    </div>
  );

  // 2. Main Game Board
  return (
    <div className="h-screen bg-slate-900 text-slate-100 font-sans flex flex-col overflow-hidden relative">
      
      {/* Top: Header & Opponents */}
      <div className="flex items-center p-2 bg-slate-950 border-b border-slate-800">
        <div className="mr-2 pr-2 border-r border-slate-800">
           <button onClick={copyInviteLink} className="p-2 bg-slate-800 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700 transition-all active:scale-95">
             {copyStatus==='copied' ? <CheckCircle2 size={18} className="text-green-500"/> : <Share2 size={18}/>}
           </button>
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide flex-1">
          {players.filter(p => p.id !== user.uid).map(p => (
            <div key={p.id} onClick={()=>setShowOpponent(p)} className="flex flex-col items-center min-w-[60px] cursor-pointer group">
              <div className={`w-10 h-10 rounded-full border-2 transition-all ${roomData.turnOrder[roomData.turnIndex]===p.id ? 'border-amber-500 ring-2 ring-amber-500/50 scale-110' : 'border-slate-600 group-hover:border-slate-400'} bg-slate-800 flex items-center justify-center font-bold text-sm`}>
                {p.name[0]}
              </div>
              <div className="flex items-center gap-1 text-[10px] mt-1 bg-slate-800 px-1.5 py-0.5 rounded-full border border-slate-700">
                <Crown size={8} className="text-yellow-500"/> {p.score}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Center: Board */}
      <div className="flex-1 overflow-y-auto p-4 pb-40 space-y-6">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {roomData.nobles.map(noble => (
            <div key={noble.id} className="flex-shrink-0 w-20 h-20 bg-amber-100 rounded-lg border-2 border-amber-300 p-1 flex flex-col justify-between shadow-lg">
              <span className="font-black text-amber-800 text-lg leading-none">{noble.points}</span>
              <div className="flex flex-wrap gap-0.5 justify-end">
                {Object.entries(noble.req).map(([color, count]) => count > 0 && (
                  <div key={color} className={`w-4 h-5 ${GEM_STYLE[color]} text-[8px] flex items-center justify-center font-bold rounded-sm border-0 shadow-sm`}>{count}</div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {[3, 2, 1].map(tier => (
          <div key={tier} className="space-y-2">
            <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${tier===3?'bg-blue-400':tier===2?'bg-yellow-400':'bg-green-400'}`}/><span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tier {tier}</span></div>
            <div className="grid grid-cols-4 gap-2">
              {roomData.board[tier].map(card => (
                <div key={card.id} onClick={() => setActiveCard(card)} className={`aspect-[2/3] bg-white rounded-lg p-1.5 flex flex-col justify-between cursor-pointer border-b-4 shadow-md transition-all active:scale-95 ${canBuy(card, myData) ? 'border-green-500 ring-2 ring-green-500/50' : 'border-slate-300 opacity-90'}`}>
                  <div className="flex justify-between items-start"><span className="text-lg font-black text-slate-800 leading-none">{card.points || ''}</span><div className={`w-4 h-4 rounded-full ${GEM_STYLE[card.bonus]} border shadow-sm`}></div></div>
                  <div className="flex flex-col-reverse gap-0.5">{Object.entries(card.cost).map(([color, count]) => count > 0 && (<div key={color} className={`w-4 h-4 rounded-full ${GEM_STYLE[color]} border flex items-center justify-center text-[9px] font-bold`}>{count}</div>))}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {isMyTurn && (
        <button onClick={() => setShowGemModal(true)} className="absolute bottom-36 right-4 w-14 h-14 bg-gradient-to-br from-amber-500 to-amber-700 rounded-full shadow-[0_4px_20px_rgba(245,158,11,0.4)] border-2 border-white/20 flex items-center justify-center animate-bounce-slow z-20 active:scale-95 transition-transform">
          <Gem size={28} className="text-white drop-shadow-md" />
        </button>
      )}

      {/* Bottom: Dashboard */}
      <div className="absolute bottom-0 w-full bg-slate-950/90 backdrop-blur-md border-t border-slate-800 p-4 pb-6 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-10">
        <div className="flex justify-between items-end mb-3">
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{myData.name}</p>
            <div className="flex items-center gap-2"><span className="text-3xl font-black text-white">{myData.score}</span><span className="text-xs text-slate-500 font-bold">Points</span></div>
          </div>
          {isMyTurn && <div className="px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]">MY TURN</div>}
        </div>
        <div className="flex justify-between gap-1">
          {[...COLORS, 'gold'].map(color => (
            <div key={color} className="flex flex-col items-center gap-1 flex-1">
              <div className={`relative w-10 h-10 rounded-full ${GEM_STYLE[color]} border-2 shadow-inner flex items-center justify-center`}>
                <span className="font-black text-sm drop-shadow-md">{myData.gems[color]}</span>
                {color !== 'gold' && myData.bonuses[color] > 0 && <div className="absolute -top-2 -right-2 bg-slate-800 border border-slate-600 w-5 h-5 rounded-full flex items-center justify-center text-[9px] text-white shadow-sm">+{myData.bonuses[color]}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      {activeCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 animate-in fade-in" onClick={() => setActiveCard(null)}>
          <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl relative transform transition-all" onClick={e => e.stopPropagation()}>
            <div className="aspect-[2/3] bg-slate-100 rounded-2xl border-4 border-slate-200 p-4 mb-6 relative overflow-hidden">
               <div className={`absolute top-0 right-0 p-6 rounded-bl-[3rem] ${GEM_STYLE[activeCard.bonus]} opacity-20`}></div>
               <div className="flex justify-between items-start mb-8"><span className="text-5xl font-black text-slate-800">{activeCard.points || ''}</span><div className={`w-12 h-12 rounded-full ${GEM_STYLE[activeCard.bonus]} border-4 border-white shadow-lg`}></div></div>
               <div className="space-y-2 absolute bottom-4 left-4">{Object.entries(activeCard.cost).map(([color, count]) => count > 0 && (<div key={color} className={`w-8 h-8 rounded-full ${GEM_STYLE[color]} border-2 border-white shadow-md flex items-center justify-center font-bold text-sm`}>{count}</div>))}</div>
            </div>
            {isMyTurn && (
              <div className="flex gap-3">
                <button onClick={() => buyCard(activeCard)} disabled={!canBuy(activeCard, myData)} className="flex-1 bg-green-600 disabled:bg-slate-300 text-white py-4 rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-all">구매</button>
                <button onClick={() => reserveCard(activeCard)} className="flex-1 bg-amber-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-all">찜</button>
              </div>
            )}
          </div>
        </div>
      )}

      {showGemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 animate-in fade-in">
          <div className="bg-slate-900 w-full max-w-sm rounded-[2rem] p-6 border border-slate-700 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-6 text-center">보석 가져오기</h3>
            <div className="grid grid-cols-3 gap-4 mb-8">
              {COLORS.map(c => {
                const count = selectedGems.filter(g => g === c).length;
                const left = roomData.bank[c] - count;
                return (
                  <button key={c} disabled={left <= 0 || (count >= 2) || (selectedGems.length >= 3 && !selectedGems.includes(c))} onClick={() => { if (selectedGems.includes(c)) setSelectedGems(selectedGems.filter((_, i) => i !== selectedGems.indexOf(c))); else setSelectedGems([...selectedGems, c]); }} className={`aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 border-2 transition-all ${GEM_STYLE[c]} ${count > 0 ? 'ring-4 ring-white scale-105' : 'opacity-80'} ${left <= 0 ? 'opacity-30 grayscale cursor-not-allowed' : ''}`}>
                    <div className="font-black text-lg">{left}</div>
                    {count > 0 && <div className="absolute top-1 right-1 bg-white text-black w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold border">{count}</div>}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowGemModal(false); setSelectedGems([]); }} className="flex-1 bg-slate-800 text-slate-300 py-3 rounded-xl font-bold">취소</button>
              <button onClick={confirmTakeGems} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-500/30">가져오기</button>
            </div>
          </div>
        </div>
      )}

      {showOpponent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 animate-in fade-in" onClick={() => setShowOpponent(null)}>
           <div className="bg-white w-full max-w-xs rounded-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-2xl font-black text-slate-800 mb-4">{showOpponent.name}의 자원</h3>
              <div className="grid grid-cols-3 gap-2">
                 {[...COLORS, 'gold'].map(c => (
                   <div key={c} className={`p-3 rounded-xl flex flex-col items-center ${GEM_STYLE[c]}`}>
                      <span className="text-xs font-bold uppercase opacity-80">{c}</span>
                      <span className="text-xl font-black">{showOpponent.gems[c]}</span>
                      {c !== 'gold' && showOpponent.bonuses[c] > 0 && <span className="text-xs bg-black/20 px-1 rounded">+{showOpponent.bonuses[c]}</span>}
                   </div>
                 ))}
              </div>
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-slate-500 font-bold mb-2">찜한 카드</p>
                <div className="flex gap-2">{showOpponent.reserved.map(c => <div key={c.id} className="w-8 h-12 bg-slate-200 rounded border border-slate-300"></div>)}</div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
