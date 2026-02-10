
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Box, Sphere, Text, PerspectiveCamera, Environment, Stars } from '@react-three/drei';
import * as THREE from 'three';

// --- Constants & Types ---

const GRID_SIZE = 21; // 21x21 grid (-10 to 10)
const BOUNDARY = (GRID_SIZE - 1) / 2;

const SPEEDS = {
  SLOW: 200,
  MEDIUM: 120,
  FAST: 70,
};

type ViewMode = '3RD_PERSON' | '1ST_PERSON';
type GameState = 'MENU' | 'PLAYING' | 'GAME_OVER';
type Direction = [number, number]; // [x, z]

// Helper to generate random food position not on snake
const getRandomPosition = (snake: number[][]): [number, number] => {
  let position: [number, number];
  let isOnSnake = true;
  while (isOnSnake) {
    const x = Math.floor(Math.random() * GRID_SIZE) - BOUNDARY;
    const z = Math.floor(Math.random() * GRID_SIZE) - BOUNDARY;
    position = [x, z];
    isOnSnake = snake.some(([sx, sz]) => sx === x && sz === z);
  }
  return position!;
};

// --- 3D Components ---

// The floor grid
const GameGrid = () => (
  <group position={[0, -0.5, 0]}>
    <gridHelper args={[GRID_SIZE, GRID_SIZE, 0xff00ff, 0x444444]} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
      <planeGeometry args={[GRID_SIZE + 10, GRID_SIZE + 10]} />
      <meshStandardMaterial color="#050505" />
    </mesh>
  </group>
);

// The Snake
const Snake = ({ snake, viewMode }: { snake: number[][], viewMode: ViewMode }) => {
  return (
    <group>
      {snake.map(([x, z], index) => (
        <Box 
          key={`${x}-${z}-${index}`} 
          position={[x, 0, z]} 
          args={[0.9, 0.9, 0.9]}
        >
          <meshStandardMaterial 
            color={index === 0 ? "#00ff00" : "#00aa00"} 
            emissive={index === 0 ? "#004400" : "#002200"}
            opacity={viewMode === '1ST_PERSON' && index === 0 ? 0.2 : 1} // Make head transparent in 1st person
            transparent={viewMode === '1ST_PERSON' && index === 0}
          />
        </Box>
      ))}
    </group>
  );
};

// The Food
const Food = ({ position }: { position: [number, number] }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 5) * 0.2 + 0.3;
      meshRef.current.rotation.y += 0.05;
    }
  });

  return (
    <group position={[position[0], 0, position[1]]}>
      <Sphere ref={meshRef as any} args={[0.4, 16, 16]}>
        <meshStandardMaterial color="#ff0055" emissive="#550022" emissiveIntensity={2} />
      </Sphere>
      <pointLight distance={3} intensity={2} color="#ff0055" />
    </group>
  );
};

// Camera Controller
const GameCamera = ({ 
  viewMode, 
  headPos, 
  direction 
}: { 
  viewMode: ViewMode, 
  headPos: number[], 
  direction: Direction 
}) => {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const vec = new THREE.Vector3();

  useFrame(() => {
    if (!cameraRef.current) return;

    if (viewMode === '3RD_PERSON') {
      // Smooth lerp to overhead view
      vec.set(0, 18, 12); // Isometric-ish top down
      cameraRef.current.position.lerp(vec, 0.1);
      cameraRef.current.lookAt(0, 0, 0);
    } else {
      // 1st Person: Position at head, looking forward
      // Current head position
      const [hx, hz] = headPos;
      const [dx, dz] = direction;

      // Target position: slightly above the head
      const targetPos = new THREE.Vector3(hx, 0.8, hz);
      
      // Target look: The grid cell in front of the head
      const targetLook = new THREE.Vector3(hx + dx * 5, 0, hz + dz * 5);

      cameraRef.current.position.lerp(targetPos, 0.2);
      
      // We manually handle rotation smoothing by looking at an interpolated target
      // But for Snake, snapping or fast lerp is usually better to prevent motion sickness
      cameraRef.current.lookAt(targetLook);
    }
  });

  return <PerspectiveCamera makeDefault ref={cameraRef} fov={60} />;
};

// --- Main App Component ---

const App = () => {
  // Game State
  const [gameState, setGameState] = useState<GameState>('MENU');
  const [speed, setSpeed] = useState<number>(SPEEDS.MEDIUM);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('3RD_PERSON');
  
  // Snake State
  const [snake, setSnake] = useState<number[][]>([[0, 2], [0, 1], [0, 0]]);
  const [food, setFood] = useState<[number, number]>([0, 5]);
  const [direction, setDirection] = useState<Direction>([0, 1]); // Moving +Z (South)
  const directionRef = useRef<Direction>([0, 1]); // Ref for immediate key updates
  const moveQueue = useRef<Direction[]>([]); // Queue to prevent self-collision on fast turns

  // Load high score
  useEffect(() => {
    const saved = localStorage.getItem('snake_highscore');
    if (saved) setHighScore(parseInt(saved, 10));
  }, []);

  // Update high score
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('snake_highscore', score.toString());
    }
  }, [score, highScore]);

  // Input Handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState !== 'PLAYING') return;

      const key = e.key.toLowerCase();
      let newDir: Direction | null = null;

      if (key === 'w' || key === 'arrowup') newDir = [0, -1];
      if (key === 's' || key === 'arrowdown') newDir = [0, 1];
      if (key === 'a' || key === 'arrowleft') newDir = [-1, 0];
      if (key === 'd' || key === 'arrowright') newDir = [1, 0];
      
      if (key === ' ') {
         setViewMode(prev => prev === '3RD_PERSON' ? '1ST_PERSON' : '3RD_PERSON');
         return;
      }

      if (newDir) {
        // Prevent 180 degree turns
        const currentDir = moveQueue.current.length > 0 
          ? moveQueue.current[moveQueue.current.length - 1] 
          : directionRef.current;
          
        if (currentDir[0] !== -newDir[0] || currentDir[1] !== -newDir[1]) {
          moveQueue.current.push(newDir);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  // Game Loop
  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    const moveSnake = () => {
      // Process next move from queue or keep current
      if (moveQueue.current.length > 0) {
        directionRef.current = moveQueue.current.shift()!;
        setDirection(directionRef.current);
      }
      
      const currentDir = directionRef.current;

      setSnake(prevSnake => {
        const head = prevSnake[0];
        const newHead = [head[0] + currentDir[0], head[1] + currentDir[1]];

        // 1. Check Wall Collision
        if (
          newHead[0] < -BOUNDARY || 
          newHead[0] > BOUNDARY || 
          newHead[1] < -BOUNDARY || 
          newHead[1] > BOUNDARY
        ) {
          setGameState('GAME_OVER');
          return prevSnake;
        }

        // 2. Check Self Collision
        for (let i = 0; i < prevSnake.length - 1; i++) { // Ignore tail tip as it will move
           if (newHead[0] === prevSnake[i][0] && newHead[1] === prevSnake[i][1]) {
             setGameState('GAME_OVER');
             return prevSnake;
           }
        }

        const newSnake = [newHead, ...prevSnake];

        // 3. Check Food
        if (newHead[0] === food[0] && newHead[1] === food[1]) {
          setScore(s => s + 10);
          setFood(getRandomPosition(newSnake));
          // Don't pop tail, so snake grows
        } else {
          newSnake.pop();
        }

        return newSnake;
      });
    };

    const intervalId = setInterval(moveSnake, speed);
    return () => clearInterval(intervalId);
  }, [gameState, speed, food]);

  const startGame = (selectedSpeed: number) => {
    setSpeed(selectedSpeed);
    setSnake([[0, 0], [0, -1], [0, -2]]); // Reset snake
    setDirection([0, 1]);
    directionRef.current = [0, 1];
    moveQueue.current = [];
    setScore(0);
    setFood(getRandomPosition([[0,0], [0,-1], [0,-2]]));
    setGameState('PLAYING');
    setViewMode('3RD_PERSON');
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#111', position: 'relative', fontFamily: 'monospace' }}>
      
      {/* 3D Scene */}
      <Canvas shadows>
        <color attach="background" args={['#050510']} />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} castShadow />
        
        <GameCamera 
          viewMode={viewMode} 
          headPos={snake[0]} 
          direction={direction} 
        />
        
        <GameGrid />
        <Snake snake={snake} viewMode={viewMode} />
        <Food position={food} />
        
        <Environment preset="city" />
      </Canvas>

      {/* UI Overlay */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        
        {/* HUD */}
        <div style={{ position: 'absolute', top: '20px', left: '20px', color: '#0f0', display: 'flex', gap: '20px' }}>
          <div>SCORE: {score}</div>
          <div>BEST: {highScore}</div>
        </div>
        
        <div style={{ position: 'absolute', top: '20px', right: '20px', color: '#fff', textAlign: 'right' }}>
           <div style={{ fontSize: '12px', opacity: 0.7 }}>CAMERA: {viewMode === '3RD_PERSON' ? '3RD PERSON' : '1ST PERSON'}</div>
           <div style={{ fontSize: '10px', opacity: 0.5 }}>[SPACE] TO SWITCH</div>
        </div>

        {/* Start Menu */}
        {gameState === 'MENU' && (
          <div style={{ 
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', 
            background: 'rgba(0,0,0,0.85)', padding: '40px', borderRadius: '10px', border: '1px solid #0f0',
            textAlign: 'center', pointerEvents: 'auto', backdropFilter: 'blur(5px)'
          }}>
            <h1 style={{ color: '#0f0', margin: '0 0 30px 0', fontSize: '48px', textShadow: '0 0 10px #0f0' }}>NEON SNAKE</h1>
            <p style={{ color: '#fff', marginBottom: '20px' }}>SELECT SPEED</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button onClick={() => startGame(SPEEDS.SLOW)} style={buttonStyle}>SLOW</button>
              <button onClick={() => startGame(SPEEDS.MEDIUM)} style={buttonStyle}>MEDIUM</button>
              <button onClick={() => startGame(SPEEDS.FAST)} style={buttonStyle}>FAST</button>
            </div>
            <p style={{ color: '#aaa', fontSize: '12px', marginTop: '30px' }}>Use WASD or ARROW KEYS to move</p>
          </div>
        )}

        {/* Game Over Screen */}
        {gameState === 'GAME_OVER' && (
          <div style={{ 
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', 
            background: 'rgba(50,0,0,0.9)', padding: '40px', borderRadius: '10px', border: '1px solid #f00',
            textAlign: 'center', pointerEvents: 'auto'
          }}>
            <h1 style={{ color: '#f00', margin: '0 0 20px 0', fontSize: '48px' }}>GAME OVER</h1>
            <p style={{ color: '#fff', fontSize: '24px', marginBottom: '10px' }}>SCORE: {score}</p>
            {score >= highScore && score > 0 && <p style={{ color: '#ff0', marginBottom: '20px' }}>NEW HIGH SCORE!</p>}
            
            <button onClick={() => setGameState('MENU')} style={{ ...buttonStyle, borderColor: '#fff', color: '#fff' }}>
              MAIN MENU
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const buttonStyle = {
  background: 'transparent',
  border: '1px solid #0f0',
  color: '#0f0',
  padding: '10px 20px',
  fontSize: '16px',
  cursor: 'pointer',
  fontFamily: 'monospace',
  transition: 'all 0.2s',
  textTransform: 'uppercase' as const,
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
