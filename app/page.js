'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, doc, setDoc, onSnapshot, collection, updateDoc, arrayUnion, arrayRemove, getDocs, getDoc 
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  Gem, Crown, User, ChevronRight, Lock, Plus, Play, 
  Share2, CheckCircle2, Copy, Trophy, AlertTriangle, X
} from 'lucide-react';

// ==================================================================
// [필수] Firebase 설정 (본인의 설정값으로 교체 필요)
// ==================================================================
const firebaseConfig = {
  apiKey: "YOUR_API_KEY", // 실제 키 입력 필요
  authDomain: "test-4305d.firebaseapp.com",
  projectId: "test-4305d",
  storageBucket: "test-4305d.firebasestorage.app",
  messagingSenderId: "402376205992",
  appId: "1:402376205992:web:be662592fa4d5f0efb849d"
};

// --- Firebase 초기화 ---
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

// --- 게임 데이터 상수 ---
const COLORS = ['white', 'blue', 'green', 'red', 'black']; 
const GEM_STYLE = {
  white: 'bg-slate-100 border-slate-300 text-slate-800',
  blue: 'bg-blue-500 border-blue-700 text-white',
  green: 'bg-emerald-500 border-emerald-700 text-white',
  red: 'bg-rose-500 border-rose-700 text-white',
  black: 'bg-slate-800 border-black text-white',
  gold: 'bg-yellow-400 border-yellow-600 text-yellow-900'
};

// 카드 생성기 (간단한 랜덤 로직)
const generateCards = () => {
  const cards = [];
  const tiers = [1, 2, 3];
  tiers.forEach(tier => {
    for (let i = 0; i < 30; i++) { // 넉넉하게 30장씩
      const bonus = COLORS[Math.floor(Math.random() * 5)];
      const cost = {};
      // 티어별 비용 랜덤 생성
      const totalCost = tier === 1 ? 3 : tier === 2 ? 6 : 10;
      let remain = totalCost;
      while(remain > 0) {
        const c = COLORS[Math.floor(Math.random() * 5)];
        if((cost[c]||0) < 4) { // 한 색상은 최대 4개까지만
            cost[c] = (cost[c] || 0) + 1;
            remain--;
        }
      }
      
      cards.push({
        id: `t${tier}_${i}_${Math.random().toString(36).substr(2,9)}`,
        tier,
        bonus,
        points: tier === 1 ? (Math.random()>0.7 ? 1 : 0) : tier === 2 ? (Math.floor(Math.random()*3)+1) : (Math.floor(Math.random()*3)+3),
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
  { id: 'n6', points: 3, req: { white: 3, blue: 0, green: 0, red: 3, black: 3 } },
  { id: 'n7', points: 3, req: { white: 0, blue: 3, green: 3, red: 3, black: 0 } },
  { id: 'n8', points: 3, req: { white: 0, blue: 0, green: 3, red: 3, black: 3 } },
];

export default function SplendorFullGame() {
  const [user, setUser] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [roomData, setRoomData] = useState(null);
  const [players, setPlayers] = useState([]);
  
  // UI 상태
  const [activeCard, setActiveCard] = useState(null);
  const [showGemModal, setShowGemModal] = useState(false);
  const [showOpponent, setShowOpponent] = useState(null);
  const [selectedGems, setSelectedGems] = useState([]);
  const [copyStatus, setCopyStatus] = useState(null);
  const [isInviteMode, setIsInviteMode] = useState(false);
  
  // 특수 상태 (버리기, 게임 종료)
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [gemsToDiscard, setGemsToDiscard] = useState([]);

  // --- 초기화 및 동기화 ---
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const code = p.get('room');
      if (code && code.length === 4) {
        setRoomCode(code.toUpperCase());
        setIsInviteMode(true);
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

  // --- 유틸리티 및 계산 ---
  const myData = user ? players.find(p => p.id === user.uid) : null;
  const isMyTurn = roomData?.status === 'playing' || roomData?.status === 'final_round' ? roomData?.turnOrder?.[roomData.turnIndex] === user?.uid : false;
  
  // 총 보석 수 계산
  const getTotalGems = (playerGems) => {
    if(!playerGems) return 0;
    return Object.values(playerGems).reduce((a, b) => a + b, 0);
  };

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

  // --- 액션 핸들러 ---
  
  const handleCreate = async () => {
    if(!playerName.trim()) return alert('닉네임을 입력해주세요.');
    const code = Math.random().toString(36).substring(2,6).toUpperCase();
    const allCards = generateCards();
    const board = { 1: allCards.filter(c=>c.tier===1).slice(0,4), 2: allCards.filter(c=>c.tier===2).slice(0,4), 3: allCards.filter(c=>c.tier===3).slice(0,4) };
    const decks = { 1: allCards.filter(c=>c.tier===1).slice(4), 2: allCards.filter(c=>c.tier===2).slice(4), 3: allCards.filter(c=>c.tier===3).slice(4) };
    
    // 귀족 랜덤 5장 (인원수 + 1이 정석이지만 편의상 4~5장 고정)
    const shuffledNobles = [...NOBLES].sort(() => 0.5 - Math.random()).slice(0, 5);

    await setDoc(doc(db,'rooms',code), {
      hostId: user.uid, status: 'lobby', board, decks, 
      bank: { white: 7, blue: 7, green: 7, red: 7, black: 7, gold: 5 },
      nobles: shuffledNobles, turnIndex: 0, turnOrder: []
    });
    await setDoc(doc(db,'rooms',code,'players',user.uid), { 
      name: playerName, score: 0, 
      gems: { white:0, blue:0, green:0, red:0, black:0, gold:0 },
      bonuses: { white:0, blue:0, green:0, red:0, black:0 },
      cards: [], reserved: []
    });
    setRoomCode(code);
    setIsInviteMode(true);
  };

  const handleJoin = async () => {
    if(!playerName.trim()) return alert('닉네임을 입력해주세요.');
    const roomRef = doc(db,'rooms',roomCode);
    const roomSnap = await getDoc(roomRef);
    if(!roomSnap.exists()) return alert('존재하지 않는 방입니다.');
    if(roomSnap.data().status !== 'lobby') return alert('이미 게임이 시작되었습니다.');
    
    const playersRef = collection(db, 'rooms', roomCode, 'players');
    const playersSnap = await getDocs(playersRef);
    if(playersSnap.size >= 4) return alert('방이 꽉 찼습니다.');

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

  const copyInviteLink = () => {
    if (typeof window === 'undefined') return;
    const baseUrl = window.location.href.split('?')[0];
    const inviteUrl = `${baseUrl}?room=${roomCode}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopyStatus('copied');
    setTimeout(() => setCopyStatus(null), 2000);
  };

  // --- 핵심 게임 로직 ---

  const checkGameEnd = (currentScore, updates) => {
    // 15점 도달 시 마지막 라운드 트리거
    if (currentScore >= 15 && roomData.status !== 'final_round') {
      updates.status = 'final_round';
    }
    
    // 턴 넘김 계산
    const nextTurnIndex = (roomData.turnIndex + 1) % players.length;
    updates.turnIndex = nextTurnIndex;

    // 마지막 라운드 상태에서 턴이 다시 0번으로 돌아오면 게임 종료
    if (roomData.status === 'final_round' && nextTurnIndex === 0) {
      updates.status = 'ended';
    }
  };

  const finishTurn = async (newBank, myNewGems, updates, playerUpdates) => {
    // 10개 제한 체크
    const totalGems = getTotalGems(myNewGems);
    
    if (totalGems > 10) {
      // 10개가 넘으면 DB는 업데이트하되 턴은 넘기지 않고 클라이언트에서 버리기 모드 진입
      // 임시 저장을 위해 플레이어 상태만 먼저 업데이트 (다른 플레이어에게는 보임)
      // 하지만 턴 인덱스는 변경하지 않음
      
      // 편의상: 로컬 스테이트로 버리기 모드 진입. 
      // 실제 구현: 일단 DB에 보석 업데이트 -> 턴은 안 넘김 -> 버리기 모달 띄움
      
      const updatesWithoutTurn = { ...updates };
      delete updatesWithoutTurn.turnIndex; // 턴 넘김 취소
      delete updatesWithoutTurn.status; // 게임 종료 상태 취소 (버리고 나서 판별해야 하므로)

      await updateDoc(doc(db, 'rooms', roomCode), updatesWithoutTurn);
      await updateDoc(doc(db, 'rooms', roomCode, 'players', user.uid), playerUpdates);
      
      // 로컬에서 버리기 모달 활성화
      setGemsToDiscard([]);
      setShowDiscardModal(true);
      return; 
    }

    // 10개 이하이면 정상적으로 턴 넘김 및 업데이트
    await updateDoc(doc(db, 'rooms', roomCode), updates);
    await updateDoc(doc(db, 'rooms', roomCode, 'players', user.uid), playerUpdates);
  };

  const confirmTakeGems = async () => {
    if (!myData) return;
    const counts = {};
    selectedGems.forEach(c => counts[c] = (counts[c]||0)+1);
    const types = Object.keys(counts).length;
    const total = selectedGems.length;
    
    let isValid = false;
    if (total === 3 && types === 3) isValid = true; // 서로 다른 3개
    if (total === 2 && types === 1) { // 같은 색 2개
      if (roomData.bank[selectedGems[0]] >= 4) isValid = true;
    }

    if (!isValid) return alert("규칙: 서로 다른 3개 또는 4개 이상 남은 같은 색 2개");

    const newBank = { ...roomData.bank };
    const myNewGems = { ...myData.gems };
    
    selectedGems.forEach(c => { newBank[c]--; myNewGems[c]++; });
    
    const updates = {};
    checkGameEnd(myData.score, updates); // 점수는 그대로지만 턴 계산을 위해 호출
    updates.bank = newBank;

    setShowGemModal(false); 
    setSelectedGems([]);

    await finishTurn(newBank, myNewGems, updates, { gems: myNewGems });
  };

  const handleDiscardConfirm = async () => {
    const currentTotal = getTotalGems(myData.gems);
    const discardCount = gemsToDiscard.length;
    const finalCount = currentTotal - discardCount;

    if (finalCount !== 10) {
      return alert(`보석을 ${10}개가 되도록 맞춰야 합니다. (현재: ${finalCount}개)`);
    }

    const newBank = { ...roomData.bank };
    const myNewGems = { ...myData.gems };

    gemsToDiscard.forEach(c => {
      newBank[c]++;
      myNewGems[c]--;
    });

    const updates = { bank: newBank };
    // 버리기 완료 후 턴 넘김 및 게임 종료 체크 다시 수행
    checkGameEnd(myData.score, updates);

    await updateDoc(doc(db, 'rooms', roomCode), updates);
    await updateDoc(doc(db, 'rooms', roomCode, 'players', user.uid), { gems: myNewGems });
    
    setShowDiscardModal(false);
    setGemsToDiscard([]);
  };

  const buyCard = async (card, fromReserved = false) => {
    if (!myData || !canBuy(card, myData)) return alert("자원이 부족합니다.");

    const payment = {};
    let remainingGoldNeeded = 0;
    
    // 비용 계산
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
    payment.gold = remainingGoldNeeded;

    const newBank = { ...roomData.bank };
    const myNewGems = { ...myData.gems };
    const myNewBonuses = { ...myData.bonuses };
    
    // 은행 반환 및 플레이어 차감
    for (const c of [...COLORS, 'gold']) {
      if (payment[c] > 0) { 
        newBank[c] += payment[c]; 
        myNewGems[c] -= payment[c]; 
      }
    }

    // 카드 획득 처리
    myNewBonuses[card.bonus]++;
    let newScore = myData.score + card.points;
    const updates = {};
    
    // --- [중요] 귀족 방문 체크 ---
    const currentNobles = [...roomData.nobles];
    let visitedNoble = null;
    
    for (let i = 0; i < currentNobles.length; i++) {
      const noble = currentNobles[i];
      let qualifies = true;
      for (const color of Object.keys(noble.req)) {
        if (myNewBonuses[color] < noble.req[color]) {
          qualifies = false;
          break;
        }
      }
      if (qualifies) {
        visitedNoble = noble;
        currentNobles.splice(i, 1); // 보드에서 제거
        break; // 한 턴에 1명만
      }
    }

    if (visitedNoble) {
      newScore += visitedNoble.points;
      updates.nobles = currentNobles;
      // alert(`귀족이 방문했습니다! (+${visitedNoble.points}점)`); // UI 경험상 생략하고 점수만 올림
    }
    // ----------------------------

    // 보드/덱 업데이트
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

    updates.bank = newBank;
    
    // 게임 종료 체크
    checkGameEnd(newScore, updates);

    await finishTurn(newBank, myNewGems, updates, {
      gems: myNewGems, 
      bonuses: myNewBonuses, 
      score: newScore, 
      cards: arrayUnion(card)
    });
    setActiveCard(null);
  };

  const reserveCard = async (card) => {
    if (!myData || myData.reserved.length >= 3) return alert("3장까지만 찜 가능합니다.");
    
    const updates = {};
    const playerUpdates = { reserved: arrayUnion(card) };
    const myNewGems = { ...myData.gems };
    const newBank = { ...roomData.bank };

    // 황금 토큰 획득 (있으면)
    if (newBank.gold > 0) {
      newBank.gold -= 1;
      myNewGems.gold += 1;
      updates['bank.gold'] = newBank.gold;
    }

    // 보드 업데이트
    const tierBoard = [...roomData.board[card.tier]];
    const cardIdx = tierBoard.findIndex(c => c.id === card.id);
    const tierDeck = [...roomData.decks[card.tier]];
    const newCard = tierDeck.pop();
    if (newCard) tierBoard[cardIdx] = newCard;
    else tierBoard.splice(cardIdx, 1);
    updates[`board.${card.tier}`] = tierBoard;
    updates[`decks.${card.tier}`] = tierDeck;

    checkGameEnd(myData.score, updates);

    await finishTurn(newBank, myNewGems, updates, playerUpdates);
    setActiveCard(null);
  };

  // --- 렌더링 ---

  // 1. 대기 화면 (Lobby)
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
               {isInviteMode && (
                 <div className="text-center bg-slate-900/50 p-4 rounded-xl border border-slate-600">
                   <p className="text-slate-400 text-xs uppercase font-bold mb-1">Invitation to Room</p>
                   <p className="text-3xl font-black text-blue-400 font-mono tracking-wider">{roomCode}</p>
                 </div>
               )}
               <input 
                 value={playerName} 
                 onChange={e=>setPlayerName(e.target.value)} 
                 placeholder="닉네임 입력" 
                 className="w-full bg-slate-700 border border-slate-600 focus:border-amber-500 p-4 rounded-xl text-white font-bold outline-none"
               />
               <div className="flex gap-2">
                 <input 
                   value={roomCode} 
                   onChange={e=>setRoomCode(e.target.value.toUpperCase())} 
                   placeholder="방 코드" 
                   disabled={isInviteMode} 
                   className={`flex-1 bg-slate-700 border border-slate-600 p-4 rounded-xl text-center uppercase font-mono font-bold outline-none ${isInviteMode ? 'opacity-50' : ''}`}
                 />
                 <button onClick={handleJoin} className="bg-blue-600 text-white px-8 rounded-xl font-bold">입장</button>
               </div>
               {!isInviteMode && (
                 <button onClick={handleCreate} className="w-full bg-slate-700 p-4 rounded-xl font-bold flex items-center justify-center gap-2 mt-4">
                   <Plus size={20}/> 방 만들기
                 </button>
               )}
             </div>
           ) : (
             <div className="space-y-6">
               <div className="flex flex-col items-center justify-center p-5 bg-slate-900 rounded-xl border border-slate-600 group cursor-pointer" onClick={copyInviteLink}>
                 <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Room Code</p>
                 <div className="text-4xl font-mono font-black text-amber-500 tracking-widest flex items-center gap-3">
                   {roomCode} <Copy size={20} className="opacity-50"/>
                 </div>
                 {copyStatus && <span className="text-xs text-green-400 font-bold mt-2">링크 복사됨!</span>}
               </div>

               <div className="space-y-2">
                 {players.map(p=>(
                   <div key={p.id} className="flex gap-3 items-center p-3 bg-slate-700/50 border border-slate-700 rounded-xl">
                     <div className={`w-2.5 h-2.5 rounded-full ${p.id === roomData.hostId ? 'bg-amber-500' : 'bg-green-500'}`}/>
                     <span className="font-bold text-slate-200 flex-1">{p.name}</span>
                     {p.id === roomData.hostId && <Crown size={14} className="text-amber-500"/>}
                   </div>
                 ))}
               </div>

               {roomData?.hostId === user.uid ? (
                 <button onClick={handleStart} className="w-full bg-green-600 text-white p-4 rounded-xl font-black text-lg flex items-center justify-center gap-2">
                   <Play size={20}/> 게임 시작
                 </button>
               ) : (
                 <p className="text-center text-slate-500 animate-pulse">방장의 시작을 기다리는 중...</p>
               )}
             </div>
           )}
        </div>
      </div>
    );
  }

  // 2. 게임 종료 화면 (Winner)
  if (roomData.status === 'ended') {
    const sortedPlayers = [...players].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // 동점자 처리: 카드(개발) 수가 적은 사람이 승리
        return (a.cards?.length || 0) - (b.cards?.length || 0);
    });
    const winner = sortedPlayers[0];
    const isWinner = winner.id === user.uid;

    return (
      <div className="h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-500">
        <Trophy size={80} className={`mb-6 ${isWinner ? 'text-amber-400 animate-bounce' : 'text-slate-600'}`} />
        <h1 className="text-4xl font-black text-white mb-2">{isWinner ? "VICTORY!" : "GAME OVER"}</h1>
        <p className="text-slate-400 mb-8 font-bold">Winner: {winner.name}</p>
        
        <div className="w-full max-w-md bg-slate-800 rounded-2xl p-4 space-y-2">
          {sortedPlayers.map((p, idx) => (
            <div key={p.id} className={`flex items-center justify-between p-4 rounded-xl ${idx===0 ? 'bg-amber-500/10 border border-amber-500/50' : 'bg-slate-700'}`}>
              <div className="flex items-center gap-3">
                <span className={`font-black w-6 ${idx===0?'text-amber-500':'text-slate-500'}`}>{idx+1}</span>
                <span className="text-white font-bold">{p.name}</span>
              </div>
              <div className="text-right">
                <span className="text-xl font-black text-white">{p.score}</span>
                <span className="text-xs text-slate-400 ml-1">pts</span>
                <div className="text-[10px] text-slate-500">{p.cards.length} cards</div>
              </div>
            </div>
          ))}
        </div>
        
        <button onClick={() => window.location.reload()} className="mt-8 bg-slate-700 hover:bg-slate-600 text-white px-8 py-3 rounded-full font-bold transition-all">
          메인으로 돌아가기
        </button>
      </div>
    );
  }

  if (!myData) return <div className="h-screen flex items-center justify-center bg-slate-950 text-slate-500">Loading Game Data...</div>;

  // 3. 메인 게임 보드
  return (
    <div className="h-screen bg-slate-900 text-slate-100 font-sans flex flex-col overflow-hidden relative">
      
      {/* 상단: 헤더 & 상대방 */}
      <div className="flex items-center p-2 bg-slate-950 border-b border-slate-800 z-20">
        <div className="mr-2 pr-2 border-r border-slate-800">
           <button onClick={copyInviteLink} className="p-2 bg-slate-800 rounded-xl text-slate-400 hover:text-white">
             {copyStatus==='copied' ? <CheckCircle2 size={18} className="text-green-500"/> : <Share2 size={18}/>}
           </button>
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide flex-1 items-center">
          {players.filter(p => p.id !== user.uid).map(p => (
            <div key={p.id} onClick={()=>setShowOpponent(p)} className="flex flex-col items-center min-w-[60px] cursor-pointer group relative">
              <div className={`w-10 h-10 rounded-full border-2 transition-all ${roomData.turnOrder[roomData.turnIndex]===p.id ? 'border-amber-500 ring-2 ring-amber-500/50 scale-110' : 'border-slate-600'} bg-slate-800 flex items-center justify-center font-bold text-sm`}>
                {p.name[0]}
              </div>
              <div className="flex items-center gap-1 text-[10px] mt-1 bg-slate-800 px-1.5 py-0.5 rounded-full border border-slate-700">
                <Crown size={8} className="text-yellow-500"/> {p.score}
              </div>
              {/* 보석 수 표시 */}
              <div className="absolute -top-1 -right-1 bg-blue-900 text-[9px] w-4 h-4 rounded-full flex items-center justify-center border border-blue-500 text-blue-200">
                {getTotalGems(p.gems)}
              </div>
            </div>
          ))}
          {/* 상태 메시지 */}
          {roomData.status === 'final_round' && (
            <div className="ml-auto px-3 py-1 bg-rose-900/50 border border-rose-500 text-rose-200 text-xs font-bold rounded-full animate-pulse whitespace-nowrap">
              LAST ROUND
            </div>
          )}
        </div>
      </div>

      {/* 중앙: 게임 보드 */}
      <div className="flex-1 overflow-y-auto p-4 pb-48 space-y-6">
        {/* 귀족 */}
        <div className="flex gap-2 overflow-x-auto pb-2 min-h-[90px]">
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
          {roomData.nobles.length === 0 && <div className="text-xs text-slate-600 flex items-center justify-center w-full">귀족이 모두 방문했습니다</div>}
        </div>

        {/* 카드 티어 3, 2, 1 */}
        {[3, 2, 1].map(tier => (
          <div key={tier} className="space-y-2">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${tier===3?'bg-blue-400':tier===2?'bg-yellow-400':'bg-green-400'}`}/>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tier {tier}</span>
              <span className="text-[10px] text-slate-600 ml-auto">남은 덱: {roomData.decks[tier].length}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {roomData.board[tier].map(card => (
                <div key={card.id} onClick={() => setActiveCard(card)} className={`aspect-[2/3] bg-white rounded-lg p-2 flex flex-col justify-between cursor-pointer border-b-4 shadow-md transition-all active:scale-95 ${canBuy(card, myData) ? 'border-green-500 ring-2 ring-green-500/50' : 'border-slate-300 opacity-90'}`}>
                  <div className="flex justify-between items-start">
                    <span className="text-2xl font-black text-slate-800 leading-none">{card.points || ''}</span>
                    <div className={`w-5 h-5 rounded-full ${GEM_STYLE[card.bonus]} border shadow-sm`}></div>
                  </div>
                  <div className="flex flex-col-reverse gap-1">
                    {Object.entries(card.cost).map(([color, count]) => count > 0 && (
                      <div key={color} className={`w-5 h-5 rounded-full ${GEM_STYLE[color]} border flex items-center justify-center text-[10px] font-bold`}>{count}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 플로팅 버튼 (보석 가져오기) */}
      {isMyTurn && !showDiscardModal && (
        <button onClick={() => setShowGemModal(true)} className="absolute bottom-40 right-4 w-14 h-14 bg-gradient-to-br from-amber-500 to-amber-700 rounded-full shadow-[0_4px_20px_rgba(245,158,11,0.4)] border-2 border-white/20 flex items-center justify-center animate-bounce-slow z-30 active:scale-95 transition-transform">
          <Gem size={28} className="text-white drop-shadow-md" />
        </button>
      )}

      {/* 하단: 내 정보 (Dashboard) */}
      <div className={`absolute bottom-0 w-full bg-slate-950/95 backdrop-blur-md border-t border-slate-800 p-4 pb-8 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-20 transition-all ${isMyTurn ? 'border-t-green-500/30' : ''}`}>
        <div className="flex justify-between items-end mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-black text-white">{myData.score}</span>
              <span className="text-xs text-slate-500 font-bold uppercase">Points</span>
            </div>
            {/* 찜한 카드 표시 */}
            <div className="flex gap-1 mt-1 h-2">
               {myData.reserved.map((_, i) => <div key={i} className="w-3 h-4 bg-yellow-500/50 rounded-sm border border-yellow-500"></div>)}
            </div>
          </div>
          <div className="flex flex-col items-end">
             {isMyTurn ? 
               <div className="px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)] mb-1">MY TURN</div> :
               <div className="text-xs text-slate-500 font-bold mb-1">WAITING...</div>
             }
             <div className="text-[10px] text-slate-400">보석 합계: <span className={getTotalGems(myData.gems) > 10 ? "text-red-500 font-bold" : "text-slate-300"}>{getTotalGems(myData.gems)}</span>/10</div>
          </div>
        </div>
        
        {/* 자원 현황 */}
        <div className="flex justify-between gap-1">
          {[...COLORS, 'gold'].map(color => (
            <div key={color} className="flex flex-col items-center gap-1 flex-1 relative">
              <div className={`relative w-10 h-10 rounded-full ${GEM_STYLE[color]} border-2 shadow-inner flex items-center justify-center`}>
                <span className="font-black text-sm drop-shadow-md">{myData.gems[color]}</span>
                {color !== 'gold' && myData.bonuses[color] > 0 && (
                  <div className="absolute -top-2 -right-2 bg-slate-800 border border-slate-600 w-5 h-5 rounded-full flex items-center justify-center text-[9px] text-white shadow-sm z-10">
                    +{myData.bonuses[color]}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        
        {/* 찜한 카드 목록 토글 버튼 (간소화) */}
        {myData.reserved.length > 0 && (
           <div className="mt-3 pt-2 border-t border-slate-800 flex justify-center">
             <button onClick={() => { if(myData.reserved.length) setActiveCard(myData.reserved[0]) }} className="text-xs text-yellow-500 font-bold flex items-center gap-1">
               찜한 카드 {myData.reserved.length}장 보기 <ChevronRight size={12}/>
             </button>
           </div>
        )}
      </div>

      {/* --- 모달 모음 --- */}

      {/* 1. 카드 상세 (구매/찜) */}
      {activeCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 animate-in fade-in" onClick={() => setActiveCard(null)}>
          <div className="bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <div className="absolute top-4 right-4">
               {/* 찜한 카드들 간 이동 버튼 구현 생략 (단일 뷰) */}
               <button onClick={() => setActiveCard(null)} className="p-2 bg-slate-100 rounded-full"><X size={20}/></button>
            </div>
            
            <div className="aspect-[2/3] bg-slate-100 rounded-2xl border-4 border-slate-200 p-6 mb-6 relative overflow-hidden shadow-inner">
               <div className={`absolute top-0 right-0 p-8 rounded-bl-[4rem] ${GEM_STYLE[activeCard.bonus]} opacity-20`}></div>
               <div className="flex justify-between items-start mb-10">
                 <span className="text-6xl font-black text-slate-800">{activeCard.points || ''}</span>
                 <div className={`w-14 h-14 rounded-full ${GEM_STYLE[activeCard.bonus]} border-4 border-white shadow-xl`}></div>
               </div>
               <div className="space-y-2 absolute bottom-6 left-6">
                 {Object.entries(activeCard.cost).map(([color, count]) => count > 0 && (
                   <div key={color} className={`w-10 h-10 rounded-full ${GEM_STYLE[color]} border-2 border-white shadow-md flex items-center justify-center font-black text-lg`}>{count}</div>
                 ))}
               </div>
            </div>
            
            {isMyTurn && !showDiscardModal && (
              <div className="flex gap-3">
                <button onClick={() => buyCard(activeCard, myData.reserved.some(c=>c.id===activeCard.id))} disabled={!canBuy(activeCard, myData)} className="flex-1 bg-green-600 disabled:bg-slate-300 disabled:text-slate-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-all">
                  구매
                </button>
                {/* 이미 찜한 카드가 아니면 찜 버튼 표시 */}
                {!myData.reserved.some(c=>c.id===activeCard.id) && (
                  <button onClick={() => reserveCard(activeCard)} disabled={myData.reserved.length >= 3} className="flex-1 bg-amber-500 disabled:bg-slate-300 text-white py-4 rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-all">
                    찜하기
                  </button>
                )}
              </div>
            )}
            {!isMyTurn && <div className="text-center text-slate-500 font-bold py-2">상대방 턴입니다</div>}
          </div>
        </div>
      )}

      {/* 2. 보석 가져오기 모달 */}
      {showGemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 animate-in fade-in">
          <div className="bg-slate-900 w-full max-w-sm rounded-[2rem] p-6 border border-slate-700 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-6 text-center">보석 선택 (최대 3개)</h3>
            <div className="grid grid-cols-3 gap-4 mb-8">
              {COLORS.map(c => {
                const count = selectedGems.filter(g => g === c).length;
                const left = roomData.bank[c] - count;
                const isSelected = selectedGems.includes(c);
                // 선택 제한 로직: 이미 2개 같은걸 골랐거나, 3개 다른걸 골랐으면 비활성 등
                const canSelect = left > 0 && selectedGems.length < 3 && (!isSelected || (selectedGems.length === 1 && left >= 4)); // 단순화된 로직

                return (
                  <button key={c} 
                    onClick={() => { 
                      if (isSelected) {
                        const idx = selectedGems.indexOf(c);
                        const newArr = [...selectedGems];
                        newArr.splice(idx, 1);
                        setSelectedGems(newArr);
                      } else {
                        // 유효성 체크 (같은색 2개 하려면 4개 이상이어야 함 등은 confirm에서 최종체크하지만 여기서도 UX제공)
                        if (selectedGems.length >= 3) return;
                        if (selectedGems.length === 2 && selectedGems[0] === selectedGems[1]) return; // 이미 2개 같은거면 더 못고름
                        if (selectedGems.length === 1 && selectedGems[0] === c && roomData.bank[c] < 4) return; // 4개 미만이면 2개째 못고름
                        setSelectedGems([...selectedGems, c]); 
                      }
                    }} 
                    className={`aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 border-2 transition-all ${GEM_STYLE[c]} ${count > 0 ? 'ring-4 ring-white scale-105 z-10' : 'opacity-80 border-slate-700'} ${left <= 0 ? 'opacity-30 grayscale cursor-not-allowed' : ''}`}
                  >
                    <div className="font-black text-lg">{roomData.bank[c]}</div>
                    {count > 0 && <div className="absolute top-1 right-1 bg-white text-black w-6 h-6 rounded-full text-sm flex items-center justify-center font-bold border-2 border-slate-200">{count}</div>}
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

      {/* 3. 보석 버리기 모달 (10개 초과 시) */}
      {showDiscardModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md p-6 animate-in fade-in">
          <div className="bg-rose-900/20 w-full max-w-sm rounded-[2rem] p-6 border border-rose-500/50 shadow-2xl backdrop-blur-xl">
             <div className="text-center mb-6">
               <AlertTriangle size={40} className="text-rose-500 mx-auto mb-2 animate-bounce"/>
               <h3 className="text-xl font-bold text-white">보석이 너무 많습니다!</h3>
               <p className="text-rose-200 text-sm mt-1">10개가 되도록 버려주세요.</p>
               <p className="text-2xl font-black text-white mt-4">
                 {getTotalGems(myData.gems) - gemsToDiscard.length} / 10
               </p>
             </div>
             
             <div className="grid grid-cols-3 gap-3 mb-8">
               {[...COLORS, 'gold'].map(c => {
                 const myCount = myData.gems[c] || 0;
                 const discardCount = gemsToDiscard.filter(x => x === c).length;
                 const currentHold = myCount - discardCount;
                 
                 if (myCount === 0) return null;

                 return (
                   <button key={c}
                     disabled={currentHold <= 0}
                     onClick={() => setGemsToDiscard([...gemsToDiscard, c])}
                     className={`p-2 rounded-xl border-2 flex flex-col items-center justify-center ${GEM_STYLE[c]} ${currentHold===0 ? 'opacity-30' : ''}`}
                   >
                     <span className="text-xs font-bold uppercase mb-1">{c}</span>
                     <span className="text-lg font-black">{currentHold}</span>
                   </button>
                 )
               })}
             </div>
             
             <div className="flex gap-2">
                <button onClick={() => setGemsToDiscard(prev => prev.slice(0, -1))} disabled={gemsToDiscard.length===0} className="flex-1 bg-slate-700 text-white py-3 rounded-xl font-bold">복구</button>
                <button onClick={handleDiscardConfirm} className="flex-1 bg-rose-600 text-white py-3 rounded-xl font-bold shadow-lg">확인</button>
             </div>
          </div>
        </div>
      )}

      {/* 4. 상대방 정보 모달 */}
      {showOpponent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 animate-in fade-in" onClick={() => setShowOpponent(null)}>
           <div className="bg-white w-full max-w-xs rounded-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-2xl font-black text-slate-800 mb-1">{showOpponent.name}</h3>
              <p className="text-sm text-slate-500 font-bold mb-4">{showOpponent.score} Points</p>
              
              <div className="grid grid-cols-3 gap-2">
                 {[...COLORS, 'gold'].map(c => (
                   <div key={c} className={`p-2 rounded-xl flex flex-col items-center ${GEM_STYLE[c]}`}>
                      <span className="text-[10px] font-bold uppercase opacity-80">{c}</span>
                      <span className="text-xl font-black">{showOpponent.gems[c]}</span>
                      {c !== 'gold' && showOpponent.bonuses[c] > 0 && <span className="text-[10px] bg-black/20 px-1 rounded">+{showOpponent.bonuses[c]}</span>}
                   </div>
                 ))}
              </div>
              
              {showOpponent.reserved.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-slate-500 font-bold mb-2">찜한 카드</p>
                  <div className="flex gap-2">
                    {showOpponent.reserved.map(c => (
                      <div key={c.id} className={`w-8 h-10 rounded border ${GEM_STYLE[c.bonus]} opacity-50`}></div>
                    ))}
                  </div>
                </div>
              )}
           </div>
        </div>
      )}
    </div>
  );
}

