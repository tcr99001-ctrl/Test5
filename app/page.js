'use client';

import React, { useState, useEffect } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, doc, setDoc, onSnapshot, collection, updateDoc, deleteDoc, getDoc, arrayUnion, arrayRemove
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  Gem, Diamond, Circle, Layers, Crown, User, Info, 
  ChevronRight, ShoppingCart, Lock, Plus, AlertCircle, Play
} from 'lucide-react';

// ==================================================================
// [필수] 사용자님의 Firebase 설정값 (그대로 유지)
// ==================================================================
const firebaseConfig = {
  apiKey: "AIzaSyBPd5xk9UseJf79GTZogckQmKKwwogneco",
  authDomain: "test-4305d.firebaseapp.com",
  projectId: "test-4305d",
  storageBucket: "test-4305d.firebasestorage.app",
  messagingSenderId: "402376205992",
  appId: "1:402376205992:web:be662592fa4d5f0efb849d"
};

// --- Firebase Init (에러 방지) ---
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

// 카드 생성기
const generateCards = () => {
  const cards = [];
  const tiers = [1, 2, 3];
  tiers.forEach(tier => {
    for (let i = 0; i < 20; i++) {
      const bonus = COLORS[Math.floor(Math.random() * 5)];
      const cost = {};
      const costAmount = tier === 1 ? 3 : tier === 2 ? 6 : 10;
      for(let j=0; j<3; j++) {
        const c = COLORS[Math.floor(Math.random() * 5)];
        cost[c] = (cost[c] || 0) + (tier + Math.floor(Math.random()*2));
      }
      cards.push({
        id: `t${tier}_${i}_${Math.random().toString(36).substr(2,9)}`, // ID 생성 안전하게 변경
        tier,
        bonus,
        points: tier === 1 ? (Math.random()>0.8 ? 1 : 0) : tier === 2 ? (Math.floor(Math.random()*3)+1) : (Math.floor(Math.random()*3)+3),
        cost
      });
    }
  });
  return cards;
};

// 귀족
const NOBLES = [
  { id: 'n1', points: 3, req: { white: 4, blue: 4, green: 0, red: 0, black: 0 } },
  { id: 'n2', points: 3, req: { white: 0, blue: 0, green: 4, red: 4, black: 0 } },
  { id: 'n3', points: 3, req: { white: 0, blue: 4, green: 4, red: 0, black: 0 } },
  { id: 'n4', points: 3, req: { white: 3, blue: 3, green: 3, red: 0, black: 0 } },
  { id: 'n5', points: 3, req: { white: 0, blue: 0, green: 0, red: 4, black: 4 } },
];

export default function SplendorGameSafe() {
  const [user, setUser] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [roomData, setRoomData] = useState(null);
  const [players, setPlayers] = useState([]);
  
  // Modals
  const [activeCard, setActiveCard] = useState(null);
  const [showGemModal, setShowGemModal] = useState(false);
  const [showOpponent, setShowOpponent] = useState(null);
  
  // Local Selection
  const [selectedGems, setSelectedGems] = useState([]);

  // Auth & Sync
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const code = p.get('room');
      if (code && code.length === 4) setRoomCode(code.toUpperCase());
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

  // --- Logic Helpers ---
  // ★ [안전장치 1] 데이터가 로딩되기 전엔 undefined 반환
  const myData = user ? players.find(p => p.id === user.uid) : null;
  const isMyTurn = roomData?.status === 'playing' && roomData?.turnOrder?.[roomData.turnIndex] === user?.uid;

  const canBuy = (card, player) => {
    if (!player || !player.gems) return false; // 안전장치 추가
    let goldNeeded = 0;
    
    for (const color of COLORS) {
      const cost = card.cost[color] || 0;
      const myBonus = player.bonuses?.[color] || 0;
      const myGem = player.gems?.[color] || 0;
      
      const realCost = Math.max(0, cost - myBonus);
      if (myGem < realCost) {
        goldNeeded += (realCost - myGem);
      }
    }
    return (player.gems?.gold || 0) >= goldNeeded;
  };

  // --- Actions ---
  const handleCreate = async () => {
    if(!playerName) return alert('이름 입력');
    const code = Math.random().toString(36).substring(2,6).toUpperCase();
    
    const allCards = generateCards();
    const board = { 1: allCards.filter(c=>c.tier===1).slice(0,4), 2: allCards.filter(c=>c.tier===2).slice(0,4), 3: allCards.filter(c=>c.tier===3).slice(0,4) };
    const decks = { 1: allCards.filter(c=>c.tier===1).slice(4), 2: allCards.filter(c=>c.tier===2).slice(4), 3: allCards.filter(c=>c.tier===3).slice(4) };

    await setDoc(doc(db,'rooms',code), {
      hostId: user.uid, status: 'lobby',
      board, decks, 
      bank: { white: 7, blue: 7, green: 7, red: 7, black: 7, gold: 5 },
      nobles: NOBLES.slice(0, 4),
      turnIndex: 0, turnOrder: []
    });
    await setDoc(doc(db,'rooms',code,'players',user.uid), { 
      name: playerName, score: 0, 
      gems: { white:0, blue:0, green:0, red:0, black:0, gold:0 },
      bonuses: { white:0, blue:0, green:0, red:0, black:0 },
      cards: [], reserved: []
    });
    setRoomCode(code);
  };

  const handleJoin = async () => {
    if(!playerName) return alert('이름 입력');
    const s = await getDoc(doc(db,'rooms',roomCode));
    if(!s.exists()) return alert('방 없음');
    await setDoc(doc(db,'rooms',roomCode,'players',user.uid), { 
      name: playerName, score: 0,
      gems: { white:0, blue:0, green:0, red:0, black:0, gold:0 },
      bonuses: { white:0, blue:0, green:0, red:0, black:0 },
      cards: [], reserved: []
    });
  };

  const handleStart = async () => {
    if(players.length < 2) return alert('최소 2명');
    const order = players.map(p=>p.id).sort(()=>Math.random()-0.5);
    await updateDoc(doc(db,'rooms',roomCode), { status: 'playing', turnOrder: order, turnIndex: 0 });
  };

  // 1. 보석 가져오기
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
    
    selectedGems.forEach(c => {
      newBank[c]--;
      myNewGems[c]++;
    });

    await updateDoc(doc(db, 'rooms', roomCode), { bank: newBank, turnIndex: (roomData.turnIndex + 1) % players.length });
    await updateDoc(doc(db, 'rooms', roomCode, 'players', user.uid), { gems: myNewGems });
    
    setShowGemModal(false);
    setSelectedGems([]);
  };

  // 2. 카드 구매
  const buyCard = async (card, fromReserved = false) => {
    if (!myData || !canBuy(card, myData)) return alert("자원이 부족합니다.");

    const payment = {};
    let remainingGoldNeeded = 0;
    
    for (const color of COLORS) {
      const cost = card.cost[color] || 0;
      const bonus = myData.bonuses[color] || 0;
      const realCost = Math.max(0, cost - bonus);
      const myGem = myData.gems[color];
      
      if (myGem >= realCost) {
        payment[color] = realCost;
      } else {
        payment[color] = myGem;
        remainingGoldNeeded += (realCost - myGem);
      }
    }

    const newBank = { ...roomData.bank };
    const myNewGems = { ...myData.gems };
    const myNewBonuses = { ...myData.bonuses };
    
    for (const c of COLORS) {
      if (payment[c]) {
        newBank[c] += payment[c];
        myNewGems[c] -= payment[c];
      }
    }
    if (remainingGoldNeeded > 0) {
      newBank.gold += remainingGoldNeeded;
      myNewGems.gold -= remainingGoldNeeded;
    }

    myNewBonuses[card.bonus]++;
    const newScore = myData.score + card.points;

    const updates = { 
      bank: newBank, 
      turnIndex: (roomData.turnIndex + 1) % players.length 
    };

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
      await updateDoc(doc(db, 'rooms', roomCode, 'players', user.uid), {
        reserved: arrayRemove(card)
      });
    }

    await updateDoc(doc(db, 'rooms', roomCode), updates);
    await updateDoc(doc(db, 'rooms', roomCode, 'players', user.uid), {
      gems: myNewGems,
      bonuses: myNewBonuses,
      score: newScore,
      cards: arrayUnion(card)
    });
    
    setActiveCard(null);
  };

  // 3. 찜하기
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
  if(!user) return <div className="h-screen flex items-center justify-center bg-slate-900 text-amber-500 font-bold">Splendor Connecting...</div>;

  // 1. Lobby
  if (!roomData || roomData.status === 'lobby') {
    return (
      <div className="h-screen bg-slate-900 text-white p-6 flex flex-col justify-center max-w-md mx-auto space-y-6">
        <h1 className="text-4xl font-black text-center text-amber-500 tracking-widest">SPLENDOR</h1>
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
           {!user || !players.find(p => p.id === user.uid) ? (
             <div className="space-y-4">
               <input value={playerName} onChange={e=>setPlayerName(e.target.value)} placeholder="닉네임" className="w-full bg-slate-700 p-3 rounded text-white"/>
               <div className="flex gap-2">
                 <input value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase())} placeholder="CODE" className="flex-1 bg-slate-700 p-3 rounded text-center"/>
                 <button onClick={handleJoin} className="bg-blue-600 px-6 rounded font-bold">입장</button>
               </div>
               <button onClick={handleCreate} className="w-full bg-amber-600 p-3 rounded font-bold">방 만들기</button>
             </div>
           ) : (
             <div className="space-y-4">
               <h3 className="font-bold text-slate-400">대기실 ({players.length})</h3>
               <div className="space-y-2">
                 {players.map(p=><div key={p.id} className="flex gap-2 items-center"><div className="w-2 h-2 rounded-full bg-green-500"/>{p.name}</div>)}
               </div>
               {roomData?.hostId === user.uid && <button onClick={handleStart} className="w-full bg-green-600 p-3 rounded font-bold">게임 시작</button>}
             </div>
           )}
        </div>
      </div>
    );
  }

  // ★ [안전장치 2] 게임 중인데 내 정보가 아직 로딩 안 됐으면 대기
  if (roomData.status === 'playing' && !myData) {
    return <div className="h-screen flex items-center justify-center bg-slate-900 text-slate-400">플레이어 정보 로딩 중...</div>;
  }

  // 2. Main Game Board
  return (
    <div className="h-screen bg-slate-900 text-slate-100 font-sans flex flex-col overflow-hidden relative">
      
      {/* Top: Opponents */}
      <div className="flex p-2 gap-2 overflow-x-auto bg-slate-950 border-b border-slate-800 scrollbar-hide">
        {players.filter(p => p.id !== user.uid).map(p => (
          <div key={p.id} onClick={()=>setShowOpponent(p)} className="flex flex-col items-center min-w-[60px] cursor-pointer">
            <div className={`w-10 h-10 rounded-full border-2 ${roomData.turnOrder[roomData.turnIndex]===p.id ? 'border-amber-500 ring-2 ring-amber-500/50' : 'border-slate-600'} bg-slate-800 flex items-center justify-center font-bold`}>
              {p.name[0]}
            </div>
            <div className="flex items-center gap-1 text-xs mt-1 bg-slate-800 px-1.5 rounded-full">
              <Crown size={10} className="text-yellow-500"/> {p.score}
            </div>
          </div>
        ))}
      </div>

      {/* Center: Board */}
      <div className="flex-1 overflow-y-auto p-4 pb-40 space-y-6">
        
        {/* Nobles */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {roomData.nobles.map(noble => (
            <div key={noble.id} className="flex-shrink-0 w-20 h-20 bg-amber-100 rounded-lg border-2 border-amber-300 p-1 flex flex-col justify-between shadow-lg">
              <span className="font-black text-amber-800 text-lg leading-none">{noble.points}</span>
              <div className="flex flex-wrap gap-0.5 justify-end">
                {Object.entries(noble.req).map(([color, count]) => count > 0 && (
                  <div key={color} className={`w-4 h-5 ${GEM_STYLE[color]} text-[8px] flex items-center justify-center font-bold rounded-sm border-0`}>
                    {count}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Card Grid */}
        {[3, 2, 1].map(tier => (
          <div key={tier} className="space-y-2">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${tier===3?'bg-blue-400':tier===2?'bg-yellow-400':'bg-green-400'}`}/>
              <span className="text-xs font-bold text-slate-500">Tier {tier}</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {roomData.board[tier].map(card => (
                <div 
                  key={card.id} 
                  onClick={() => setActiveCard(card)}
                  className={`aspect-[2/3] bg-white rounded-lg p-1.5 flex flex-col justify-between cursor-pointer border-b-4 shadow-md transition-transform active:scale-95
                    ${canBuy(card, myData) ? 'border-green-500 ring-2 ring-green-500/50' : 'border-slate-300'}
                  `}
                >
                  <div className="flex justify-between items-start">
                    <span className="text-lg font-black text-slate-800 leading-none">{card.points || ''}</span>
                    <div className={`w-4 h-4 rounded-full ${GEM_STYLE[card.bonus]} border shadow-sm`}></div>
                  </div>
                  <div className="flex flex-col-reverse gap-0.5">
                    {Object.entries(card.cost).map(([color, count]) => count > 0 && (
                      <div key={color} className={`w-4 h-4 rounded-full ${GEM_STYLE[color]} border flex items-center justify-center text-[9px] font-bold`}>
                        {count}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* FAB */}
      {isMyTurn && (
        <button 
          onClick={() => setShowGemModal(true)}
          className="absolute bottom-36 right-4 w-14 h-14 bg-gradient-to-br from-amber-500 to-amber-700 rounded-full shadow-2xl border-2 border-white/20 flex items-center justify-center animate-bounce-slow z-20"
        >
          <Gem size={28} className="text-white drop-shadow-md" />
        </button>
      )}

      {/* Bottom: My Dashboard */}
      <div className="absolute bottom-0 w-full bg-slate-950/90 backdrop-blur-md border-t border-slate-800 p-4 pb-6 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-10">
        <div className="flex justify-between items-end mb-3">
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{myData.name}</p>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-black text-white">{myData.score}</span>
              <span className="text-xs text-slate-500 font-bold">Points</span>
            </div>
          </div>
          {isMyTurn && <div className="px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-full animate-pulse">MY TURN</div>}
        </div>
        
        <div className="flex justify-between gap-1">
          {[...COLORS, 'gold'].map(color => (
            <div key={color} className="flex flex-col items-center gap-1 flex-1">
              <div className={`relative w-10 h-10 rounded-full ${GEM_STYLE[color]} border-2 shadow-inner flex items-center justify-center`}>
                <span className="font-black text-sm drop-shadow-md">{myData.gems[color]}</span>
                {color !== 'gold' && myData.bonuses[color] > 0 && (
                  <div className="absolute -top-2 -right-2 bg-slate-800 border border-slate-600 w-5 h-5 rounded flex items-center justify-center text-[9px] text-white">
                    +{myData.bonuses[color]}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* --- MODALS --- */}
      {activeCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6" onClick={() => setActiveCard(null)}>
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <div className="aspect-[2/3] bg-slate-100 rounded-2xl border-4 border-slate-200 p-4 mb-6 relative overflow-hidden">
               <div className={`absolute top-0 right-0 p-6 rounded-bl-[3rem] ${GEM_STYLE[activeCard.bonus]} opacity-20`}></div>
               <div className="flex justify-between items-start mb-8">
                 <span className="text-5xl font-black text-slate-800">{activeCard.points || ''}</span>
                 <div className={`w-12 h-12 rounded-full ${GEM_STYLE[activeCard.bonus]} border-4 border-white shadow-lg`}></div>
               </div>
               <div className="space-y-2 absolute bottom-4 left-4">
                  {Object.entries(activeCard.cost).map(([color, count]) => count > 0 && (
                    <div key={color} className={`w-8 h-8 rounded-full ${GEM_STYLE[color]} border-2 border-white shadow-md flex items-center justify-center font-bold text-sm`}>
                      {count}
                    </div>
                  ))}
               </div>
            </div>
            {isMyTurn && (
              <div className="flex gap-3">
                <button 
                  onClick={() => buyCard(activeCard)}
                  disabled={!canBuy(activeCard, myData)}
                  className="flex-1 bg-green-600 disabled:bg-slate-300 text-white py-4 rounded-xl font-bold text-lg shadow-lg"
                >
                  구매
                </button>
                <button 
                  onClick={() => reserveCard(activeCard)}
                  className="flex-1 bg-amber-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg"
                >
                  찜 (+🪙)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showGemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
          <div className="bg-slate-900 w-full max-w-sm rounded-[2rem] p-6 border border-slate-700">
            <h3 className="text-xl font-bold text-white mb-6 text-center">보석 가져오기</h3>
            <div className="grid grid-cols-3 gap-4 mb-8">
              {COLORS.map(c => {
                const count = selectedGems.filter(g => g === c).length;
                const left = roomData.bank[c] - count;
                return (
                  <button 
                    key={c} 
                    disabled={left <= 0 || (count >= 2) || (selectedGems.length >= 3 && !selectedGems.includes(c))}
                    onClick={() => {
                      if (selectedGems.includes(c)) setSelectedGems(selectedGems.filter((_, i) => i !== selectedGems.indexOf(c))); 
                      else setSelectedGems([...selectedGems, c]); 
                    }}
                    className={`aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 border-2 transition-all
                      ${GEM_STYLE[c]} ${count > 0 ? 'ring-4 ring-white scale-105' : 'opacity-80'}
                      ${left <= 0 ? 'opacity-30 grayscale cursor-not-allowed' : ''}
                    `}
                  >
                    <div className="font-black text-lg">{left}</div>
                    {count > 0 && <div className="absolute top-1 right-1 bg-white text-black w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold border">{count}</div>}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowGemModal(false); setSelectedGems([]); }} className="flex-1 bg-slate-800 text-slate-300 py-3 rounded-xl font-bold">취소</button>
              <button onClick={confirmTakeGems} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg">확인</button>
            </div>
          </div>
        </div>
      )}

      {showOpponent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6" onClick={() => setShowOpponent(null)}>
           <div className="bg-white w-full max-w-xs rounded-2xl p-6" onClick={e => e.stopPropagation()}>
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
                <p className="text-xs text-slate-500 font-bold mb-2">찜한 카드 ({showOpponent.reserved.length})</p>
                <div className="flex gap-2">
                   {showOpponent.reserved.map(c => <div key={c.id} className="w-8 h-12 bg-slate-200 rounded border border-slate-300"></div>)}
                </div>
              </div>
           </div>
        </div>
      )}

    </div>
  );
                 }
