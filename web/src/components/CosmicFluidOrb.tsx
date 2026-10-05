'use client';
import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

interface CosmicFluidOrbProps {
  size?: number;
  primaryColor?: string;   // e.g. '#8b5cf6' (electric violet)
  secondaryColor?: string; // e.g. '#ec4899' (cosmic magenta)
  accentColor?: string;    // e.g. '#38bdf8' (electric cyan)
  speedMultiplier?: number;
  showTelemetry?: boolean;
  hudTitle?: string;
  hudSubtitle?: string;
  hudBadge?: string;
  variant?: 'compact' | 'detailed';
}

/* ── Simplex 3D Noise GLSL Implementation ── */
const SIMPLEX_NOISE_GLSL = `
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

float snoise(vec3 v){
  const vec2  C = vec2(1.0/6.0, 1.0/3.0);
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

  i = mod(i, 289.0 );
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
}
`;

/* ── Vertex Shader: Circular Vortex & Fluid Displacement ── */
const FLUID_VERTEX_SHADER = `
${SIMPLEX_NOISE_GLSL}

uniform float uTime;
uniform float uDisplacement;

varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vViewPosition;
varying float vNoise;

void main() {
  vNormal = normalize(normalMatrix * normal);

  // Swirling circular fluid vortex
  float angle = uTime * 0.45;
  mat2 rotY = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
  vec3 swirledPos = position;
  swirledPos.xz = rotY * swirledPos.xz;

  // Layered noise displacement creating organic fluid ripples
  float noise1 = snoise(swirledPos * 1.8 + vec3(uTime * 0.35, uTime * 0.25, uTime * 0.4));
  float noise2 = snoise(position * 3.4 - vec3(uTime * 0.2, uTime * 0.45, uTime * 0.15));
  float combinedNoise = noise1 * 0.65 + noise2 * 0.35;
  vNoise = combinedNoise;

  vec3 displacedPosition = position + normal * (combinedNoise * uDisplacement);
  vPosition = displacedPosition;

  vec4 mvPosition = modelViewMatrix * vec4(displacedPosition, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

/* ── Fragment Shader: Luminous Plasma Ribbons & Hot Core Emission ── */
const FLUID_FRAGMENT_SHADER = `
${SIMPLEX_NOISE_GLSL}

uniform float uTime;
uniform vec3 uColorPrimary;   // Electric violet
uniform vec3 uColorSecondary; // Cosmic magenta
uniform vec3 uColorAccent;    // Cyber cyan

varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vViewPosition;
varying float vNoise;

void main() {
  vec3 viewDir = normalize(vViewPosition);
  vec3 norm = normalize(vNormal);

  // Optical Fresnel Rim Glow (Luminous edge like in Cerebral AI & purple orb image)
  float fresnel = pow(1.0 - max(dot(norm, viewDir), 0.0), 2.8);

  // Multi-frequency swirling fluid filament coordinates
  float swirl1 = snoise(vPosition * 2.4 + vec3(sin(uTime * 0.5), cos(uTime * 0.6), uTime * 0.45));
  float swirl2 = snoise(vPosition * 4.8 - vec3(uTime * 0.3, sin(uTime * 0.4), cos(uTime * 0.5)));
  float fluidPattern = swirl1 * 0.65 + swirl2 * 0.35;

  // Circular looping streamline coordinates (fluid flowing in circular loop)
  float loopAngle = atan(vPosition.z, vPosition.x) + uTime * 1.5;
  float loopDist = length(vPosition.xz);
  float stream1 = snoise(vec3(cos(loopAngle) * loopDist * 2.8, vPosition.y * 3.2, sin(loopAngle) * loopDist * 2.8) + vec3(0.0, uTime * 0.4, 0.0));
  float stream2 = snoise(vec3(cos(loopAngle * 2.0 - uTime * 0.6) * 3.6, vPosition.y * 5.2, sin(loopAngle * 2.0) * 3.6));
  float circularStream = stream1 * 0.65 + stream2 * 0.35;

  // Harmonize general turbulence with directional circular looping flow
  float fluidComposite = fluidPattern * 0.4 + circularStream * 0.6;

  // High-frequency filament ribbons (curling light wisps flowing along the circular loop)
  float filament1 = pow(abs(sin(fluidComposite * 9.0 + loopAngle * 1.5)), 4.8);
  float filament2 = pow(abs(cos(fluidComposite * 13.0 - uTime * 2.8)), 5.5);
  float combinedFilament = filament1 * 0.75 + filament2 * 0.55;

  // Hot focal knot (bright internal plasma emission center)
  float coreKnot = pow(clamp(fluidComposite * 0.75 + 0.35, 0.0, 1.0), 3.2);

  // Website brand color harmony: Velvet Obsidian -> Electric Violet -> Soft Lilac -> Cyan Hot Ribbons
  vec3 baseVelvet = vec3(0.02, 0.015, 0.06);
  vec3 plasma = mix(baseVelvet, uColorPrimary, smoothstep(-0.6, 0.45, fluidComposite));
  plasma = mix(plasma, uColorSecondary, smoothstep(0.05, 0.85, fluidComposite));
  plasma += uColorAccent * combinedFilament * 1.6;
  plasma += vec3(1.0, 0.96, 1.0) * coreKnot * 0.9; // Hot white-violet filaments

  // Ethereal Fresnel rim lighting with cyan/violet chromatic fringe
  plasma += uColorPrimary * fresnel * 2.8;
  plasma += uColorAccent * pow(fresnel, 3.2) * 1.2;
  plasma += vec3(1.0, 1.0, 1.0) * pow(fresnel, 4.5) * 1.4;

  // Dynamic alpha transparency allowing interior depth to shine
  float alpha = clamp(0.85 + fresnel * 0.35 + combinedFilament * 0.28, 0.0, 1.0);

  gl_FragColor = vec4(plasma, alpha);
}
`;

/* ── Toroidal Fluid Ribbon Shader (Orbiting Energy Tendril) ── */
const RIBBON_VERTEX_SHADER = `
uniform float uTime;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const RIBBON_FRAGMENT_SHADER = `
uniform float uTime;
uniform vec3 uColor;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vec3 viewDir = normalize(vViewPosition);
  float fresnel = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 2.0);

  // Flowing energy wave along the ribbon track
  float wave = sin(vUv.x * 16.0 - uTime * 3.5);
  float alpha = smoothstep(-0.2, 0.9, wave) * (0.45 + fresnel * 0.55);

  vec3 col = uColor + vec3(0.3, 0.5, 1.0) * fresnel;
  gl_FragColor = vec4(col, alpha * 0.7);
}
`;

/* ── Electric Perimeter Halo Ring Shader (Reference Image Boundary Arc) ── */
const HALO_FRAGMENT_SHADER = `
uniform float uTime;
uniform vec3 uColor;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vec3 viewDir = normalize(vViewPosition);
  float fresnel = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 1.8);

  // Traveling high-voltage electric pulse racing around the circular perimeter
  float pulse = pow(sin(vUv.x * 6.28318 - uTime * 2.6) * 0.5 + 0.5, 2.8);
  float wave2 = pow(sin(vUv.x * 12.566 - uTime * 4.2) * 0.5 + 0.5, 3.5);
  float combinedPulse = pulse * 0.75 + wave2 * 0.45;

  vec3 col = mix(uColor, vec3(1.0, 1.0, 1.0), combinedPulse * 0.85);
  float alpha = (0.35 + combinedPulse * 0.65 + fresnel * 0.4) * 0.9;

  gl_FragColor = vec4(col, alpha);
}
`;

export default function CosmicFluidOrb({
  size = 280,
  primaryColor = '#8b5cf6',
  secondaryColor = '#ec4899',
  accentColor = '#38bdf8',
  speedMultiplier = 1.0,
  showTelemetry = true,
  hudTitle = '3D Fluid Vortex',
  hudSubtitle = 'Drag to orbit • 60 FPS',
  hudBadge = 'ACTIVE',
  variant = 'compact',
}: CosmicFluidOrbProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    mount.innerHTML = ''; // Ensure no duplicate canvas on re-mount

    /* ── Three.js Scene Setup ── */
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.z = 2.92; // Optimized perspective distance: zero sphere clipping with maximum 3D visual presence

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    /* ── Fluid Plasma Core Sphere ── */
    const sphereGeometry = new THREE.SphereGeometry(0.88, 64, 64);
    const fluidMaterial = new THREE.ShaderMaterial({
      vertexShader: FLUID_VERTEX_SHADER,
      fragmentShader: FLUID_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uDisplacement: { value: 0.14 },
        uColorPrimary: { value: new THREE.Color(primaryColor) },
        uColorSecondary: { value: new THREE.Color(secondaryColor) },
        uColorAccent: { value: new THREE.Color(accentColor) },
      },
      transparent: true,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    });
    const fluidOrb = new THREE.Mesh(sphereGeometry, fluidMaterial);
    scene.add(fluidOrb);

    /* ── Swirling Fluid Filament Tendril Ribbons ── */
    const ribbonGroup = new THREE.Group();
    scene.add(ribbonGroup);

    const ribbonGeo1 = new THREE.TorusGeometry(1.02, 0.016, 16, 100);
    const ribbonMat1 = new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERTEX_SHADER,
      fragmentShader: RIBBON_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(accentColor) },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const ribbon1 = new THREE.Mesh(ribbonGeo1, ribbonMat1);
    ribbon1.rotation.x = Math.PI / 3;
    ribbon1.rotation.y = Math.PI / 6;
    ribbonGroup.add(ribbon1);

    const ribbonGeo2 = new THREE.TorusGeometry(1.08, 0.014, 16, 100);
    const ribbonMat2 = new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERTEX_SHADER,
      fragmentShader: RIBBON_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(primaryColor) },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const ribbon2 = new THREE.Mesh(ribbonGeo2, ribbonMat2);
    ribbon2.rotation.x = -Math.PI / 4;
    ribbon2.rotation.z = Math.PI / 5;
    ribbonGroup.add(ribbon2);

    /* ── Luminous Perimeter Halo Ring (Reference Image Circular Boundary) ── */
    const haloGeo = new THREE.TorusGeometry(0.96, 0.008, 16, 120);
    const haloMat = new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERTEX_SHADER,
      fragmentShader: HALO_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(accentColor) },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.z = Math.PI / 8;
    scene.add(halo);

    /* ── Ambient Cosmic Stardust Particles (like Cerebral AI reference) ── */
    const particleCount = 140;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const radius = 1.15 + Math.random() * 0.45;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      particlePositions[i * 3]     = radius * Math.sin(phi) * Math.cos(theta);
      particlePositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      particlePositions[i * 3 + 2] = radius * Math.cos(phi);
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: new THREE.Color(primaryColor),
      size: 0.024,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });
    const stardust = new THREE.Points(particleGeo, particleMat);
    scene.add(stardust);

    /* ── Interactive Mouse & Drag Physics (like web3.ia) ── */
    let mouseX = 0;
    let mouseY = 0;
    let targetRotationX = 0;
    let targetRotationY = 0;
    let currentRotationX = 0;
    let currentRotationY = 0;
    let isDragging = false;
    let prevPointer = { x: 0, y: 0 };
    let targetSpeed = 1.0;
    let currentSpeed = 1.0;
    let accumulatedTime = 0.0;

    const onPointerDown = (e: MouseEvent) => {
      isDragging = true;
      prevPointer = { x: e.clientX, y: e.clientY };
      renderer.domElement.style.cursor = 'grabbing';
    };

    const onPointerMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      if (isDragging) {
        const deltaX = e.clientX - prevPointer.x;
        const deltaY = e.clientY - prevPointer.y;
        targetRotationY += deltaX * 0.008;
        targetRotationX += deltaY * 0.008;
        prevPointer = { x: e.clientX, y: e.clientY };
      } else {
        // Subtle natural parallax tilt
        targetRotationY = mouseX * 0.45;
        targetRotationX = -mouseY * 0.45;
      }
    };

    const onPointerUp = () => {
      isDragging = false;
      renderer.domElement.style.cursor = 'grab';
    };

    const onPointerEnter = () => {
      targetSpeed = 1.5;
    };
    const onPointerLeave = () => {
      targetSpeed = 1.0;
      targetRotationX = 0;
      targetRotationY = 0;
      isDragging = false;
      renderer.domElement.style.cursor = 'grab';
    };

    renderer.domElement.style.cursor = 'grab';
    renderer.domElement.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    renderer.domElement.addEventListener('mouseenter', onPointerEnter);
    renderer.domElement.addEventListener('mouseleave', onPointerLeave);

    /* ── Touch Events for Mobile PWA ── */
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDragging = true;
        prevPointer = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (isDragging && e.touches.length === 1) {
        const deltaX = e.touches[0].clientX - prevPointer.x;
        const deltaY = e.touches[0].clientY - prevPointer.y;
        targetRotationY += deltaX * 0.01;
        targetRotationX += deltaY * 0.01;
        prevPointer = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };
    const onTouchEnd = () => { isDragging = false; };

    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);

    /* ── Animation Loop (Continuous Delta Accumulation) ── */
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.1);
      currentSpeed += (targetSpeed - currentSpeed) * 0.08;
      accumulatedTime += delta * speedMultiplier * currentSpeed;

      // Update fluid shader time smoothly
      fluidMaterial.uniforms.uTime.value = accumulatedTime;
      ribbonMat1.uniforms.uTime.value = accumulatedTime;
      ribbonMat2.uniforms.uTime.value = accumulatedTime;
      haloMat.uniforms.uTime.value = accumulatedTime;

      // Smooth inertia rotation interpolation
      currentRotationX += (targetRotationX - currentRotationX) * 0.06;
      currentRotationY += (targetRotationY - currentRotationY) * 0.06;

      fluidOrb.rotation.y = currentRotationY + accumulatedTime * 0.15;
      fluidOrb.rotation.x = currentRotationX + Math.sin(accumulatedTime * 0.3) * 0.08;

      // Swirling tendrils rotation
      ribbonGroup.rotation.y = -accumulatedTime * 0.45 + currentRotationY;
      ribbonGroup.rotation.x = Math.cos(accumulatedTime * 0.25) * 0.15 + currentRotationX;
      ribbon1.rotation.z += delta * 0.5 * currentSpeed;
      ribbon2.rotation.z -= delta * 0.4 * currentSpeed;

      // Luminous Perimeter Halo Ring rotation
      halo.rotation.z = accumulatedTime * 0.2 + currentRotationY * 0.15;
      halo.rotation.x = currentRotationX * 0.15;

      // Ambient stardust rotation
      stardust.rotation.y = accumulatedTime * 0.08;
      stardust.rotation.x = Math.sin(accumulatedTime * 0.1) * 0.05;

      renderer.render(scene, camera);
    };

    animate();

    /* ── Cleanup ── */
    return () => {
      cancelAnimationFrame(animationFrameId);
      renderer.domElement.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      renderer.domElement.removeEventListener('mouseenter', onPointerEnter);
      renderer.domElement.removeEventListener('mouseleave', onPointerLeave);
      renderer.domElement.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      if (mount && renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
      sphereGeometry.dispose();
      fluidMaterial.dispose();
      ribbonGeo1.dispose();
      ribbonMat1.dispose();
      ribbonGeo2.dispose();
      ribbonMat2.dispose();
      haloGeo.dispose();
      haloMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
    };
  }, [size, primaryColor, secondaryColor, accentColor, speedMultiplier]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Three.js Canvas Container */}
      <div ref={mountRef} style={{ width: size, height: size, maxWidth: '100%', position: 'relative', zIndex: 1 }} />

      {/* Radiant Floor Ambient Glow */}
      <div style={{
        position: 'absolute',
        bottom: -15,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '80%',
        height: 35,
        background: `radial-gradient(ellipse, ${primaryColor}45 0%, transparent 70%)`,
        filter: 'blur(16px)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      {/* Floating Web3.ia-inspired Telemetry Badge (Corner HUD Overlay) */}
      {showTelemetry && variant === 'detailed' ? (
        <div style={{
          position: 'absolute',
          bottom: 8,
          left: '50%',
          width: 'calc(100% - 24px)',
          maxWidth: 260,
          zIndex: 4,
          background: 'rgba(8, 10, 22, 0.92)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: 14,
          padding: '8px 12px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.7), 0 0 20px rgba(139, 92, 246, 0.25)',
          pointerEvents: 'none',
          transition: 'all 0.25s ease',
          opacity: isHovered ? 1 : 0.92,
          transform: isHovered ? 'translateX(-50%) scale(1.02)' : 'translateX(-50%) scale(1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#34d399',
                boxShadow: '0 0 8px #34d399',
                animation: 'pulse 2s infinite',
                flexShrink: 0
              }} />
              <span style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.68rem',
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '0.02em',
              }}>
                {hudTitle}
              </span>
            </div>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.54rem',
              color: '#38bdf8',
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              padding: '1px 5px',
              borderRadius: 5,
              fontWeight: 600,
            }}>
              {hudBadge}
            </span>
          </div>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.56rem',
            color: 'var(--text-muted)',
            lineHeight: 1.4,
            margin: 0,
          }}>
            {hudSubtitle}
          </p>
        </div>
      ) : showTelemetry ? (
        <div style={{
          position: 'absolute',
          bottom: 8,
          left: '50%',
          zIndex: 2,
          background: 'rgba(8, 10, 24, 0.88)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 12,
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6), 0 0 16px rgba(139, 92, 246, 0.25)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          transition: 'all 0.25s ease',
          opacity: isHovered ? 1 : 0.9,
          transform: isHovered ? 'translateX(-50%) scale(1.03)' : 'translateX(-50%) scale(1)',
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#34d399',
            boxShadow: '0 0 10px #34d399',
            animation: 'pulse 2s infinite',
            flexShrink: 0
          }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.64rem',
              fontWeight: 700,
              color: '#ffffff',
              letterSpacing: '0.02em',
              lineHeight: 1.1,
            }}>
              {hudTitle}
            </span>
            <span style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.52rem',
              color: 'var(--text-dim)',
              marginTop: 1,
            }}>
              {hudSubtitle}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
