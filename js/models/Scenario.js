import * as THREE from "three";
import MusicPlayer from "./MusicPlayer.js";

import { GUI } from "three/addons/libs/lil-gui.module.min.js";
import Stats from "three/addons/libs/stats.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { CinematicCamera } from "three/addons/cameras/CinematicCamera.js";

import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { AfterimagePass } from "three/addons/postprocessing/AfterimagePass.js";
import { FilmPass } from "three/addons/postprocessing/FilmPass.js";

const noise = new SimplexNoise();

const Utils = {
  fractionate: (val, minVal, maxVal) => (val - minVal) / (maxVal - minVal),
  modulate: (val, minVal, maxVal, outMin, outMax) =>
    outMin + Utils.fractionate(val, minVal, maxVal) * (outMax - outMin),
  avg: (arr) => arr.reduce((sum, b) => sum + b) / arr.length,
  max: (arr) => arr.reduce((a, b) => Math.max(a, b)),
};

export default class Scenario {
  constructor(container) {
    this.container = document.querySelector(container);

    this.config = {
      colors: {
        purple: 0x463190,
        magenta: 0xe62695,
        yellow: 0xfacf32,
        orange: 0xf99b1d,
        blue: 0x5edaa4,
      },
      grid: {
        w: 200,
        h: 200,
      },
      camera: {
        theta: 0,
        velocity: 0.1,
        radius: 10,
        focalLength: 20,
      },
      lights: {
        theta: 0,
        velocity: 1,
        radius: 400,
      },
      particles: {
        scale: 1,
        velocity: Math.PI / 180,
      },
      bloomPass: {
        exposure: 0.7619,
        strength: 1.8,
        threshold: 0,
        radius: 0.57,
      },
      afterimagePass: {
        value: 0.75,
      },
      filmPass: {
        noiseIntensity: 0.8,
        scanlinesIntensity: 0.3,
        scanlinesCount: 256,
        grayscale: false,
      },
    };
  }

  _createStats() {
    this.stats = new Stats();
    this.container.appendChild(this.stats.dom);
  }

  _createGUI() {
    this.gui = new GUI();

    const cameraControl = this.gui.addFolder("Camera");
    cameraControl.close();

    cameraControl
      .add(this.config.camera, "velocity", 0, 1, 0.01)
      .onChange((value) => {
        this.config.camera.velocity = value;
      });

    cameraControl
      .add(this.config.camera, "radius", 5, 100)
      .onChange((value) => {
        this.config.camera.radius = value;
      });

    cameraControl
      .add(this.config.camera, "focalLength", 1, 25)
      .onChange((value) => {
        this.camera.setLens(value);
      });

    const bloomEffect = this.gui.addFolder("Bloom");
    bloomEffect.close();

    bloomEffect
      .add(this.config.bloomPass, "threshold", 0.0, 1.0)
      .onChange((value) => {
        this.bloomPass.threshold = Number(value);
      });

    bloomEffect
      .add(this.config.bloomPass, "radius", 0.0, 1.0, 0.01)
      .onChange((value) => {
        this.bloomPass.radius = Number(value);
      });

    const filmEffect = this.gui.addFolder("Film");
    filmEffect.close();

    filmEffect
      .add(this.config.filmPass, "noiseIntensity", 0, 3)
      .onChange((value) => {
        this.filmPass.uniforms.nIntensity.value = value;
      });

    filmEffect
      .add(this.config.filmPass, "scanlinesIntensity", 0, 1.0)
      .onChange((value) => {
        this.filmPass.uniforms.sIntensity.value = value;
      });

    filmEffect
      .add(this.config.filmPass, "scanlinesCount", 0, 2048)
      .onChange((value) => {
        this.filmPass.uniforms.sCount.value = value;
      });

    filmEffect.add(this.config.filmPass, "grayscale").onChange((value) => {
      this.filmPass.uniforms.grayscale.value = value;
    });
  }

  _createRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.container.appendChild(this.renderer.domElement);
  }

  _createScene() {
    this.scene = new THREE.Scene();
  }

  _createCamera() {
    this.camera = new CinematicCamera(
      75,
      window.innerWidth / window.innerHeight,
      1,
      2000
    );
    this.camera.setLens(this.config.camera.focalLength);
    this.camera.position.set(0, 5, -200);
    // this.scene.add(this.camera)
  }

  _createControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableZoom = true;
  }

  _createLights() {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0);
    this.scene.add(this.ambientLight);
  }

  _createParticles() {
    const imageData = this._getImageData(this.webcam);

    const geometry = new THREE.BufferGeometry();
    const vertices_base = [];
    const colors_base = [];

    const width = imageData.width;
    const height = imageData.height;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const posX = 0.03 * (-x + width / 2);
        const posY = 0;
        const posZ = 0.03 * (y - height / 2);
        vertices_base.push(posX, posY, posZ);

        const r = 1.0;
        const g = 1.0;
        const b = 1.0;
        colors_base.push(r, g, b);
      }
    }

    const vertices = new Float32Array(vertices_base);
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));

    const colors = new Float32Array(colors_base);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    // Set shader material
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: {
          type: "f",
          value: 0.0,
        },
        size: {
          type: "f",
          value: 5.0,
        },
      },
      vertexShader: vertexSource,
      fragmentShader: fragmentSource,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.particlesPlane = new THREE.Points(geometry, material);
    this.scene.add(this.particlesPlane);
  }

  _drawParticles(t) {
    const particles = this.particlesPlane;

    if (particles) {
      const imageData = this._getImageData(this.webcam);
      const length = particles.geometry.attributes.position.count;

      for (let i = 0; i < length; i++) {
        const index = i * 4;
        const r = imageData.data[index] / 255;
        const g = imageData.data[index + 1] / 255;
        const b = imageData.data[index + 2] / 255;
        const gray = (r + g + b) / 3;
        

        particles.geometry.attributes.position.setY(i, gray * 10);
        particles.geometry.attributes.color.setX(i, r);
        particles.geometry.attributes.color.setY(i, g);
        particles.geometry.attributes.color.setZ(i, b);
      }

      particles.geometry.attributes.position.needsUpdate = true;
      particles.geometry.attributes.color.needsUpdate = true;
    }
  }

  /**
   * Preloads music buffers
   * @param {MusicPlayer} musicPlayer - Music Player
   * */
  _createAudio(musicPlayer) {
    this.musicPlayer = musicPlayer;
    this.samples = this.musicPlayer.samples;

    this.audioContext = new AudioContext();

    const sample0 = this.audioContext.createMediaElementSource(
      this.samples[0].element
    );
    const sample1 = this.audioContext.createMediaElementSource(
      this.samples[1].element
    );
    const sample2 = this.audioContext.createMediaElementSource(
      this.samples[2].element
    );
    const sample3 = this.audioContext.createMediaElementSource(
      this.samples[3].element
    );

    this.audioAnalyser0 = this.audioContext.createAnalyser();
    this.audioAnalyser1 = this.audioContext.createAnalyser();
    this.audioAnalyser2 = this.audioContext.createAnalyser();
    this.audioAnalyser3 = this.audioContext.createAnalyser();

    sample0.connect(this.audioAnalyser0);
    sample1.connect(this.audioAnalyser1);
    sample2.connect(this.audioAnalyser2);
    sample3.connect(this.audioAnalyser3);

    this.audioAnalyser0.connect(this.audioContext.destination);
    this.audioAnalyser1.connect(this.audioContext.destination);
    this.audioAnalyser2.connect(this.audioContext.destination);
    this.audioAnalyser3.connect(this.audioContext.destination);

    this.audioAnalyser0.fftSize = 512;
    this.audioAnalyser1.fftSize = 512;
    this.audioAnalyser2.fftSize = 512;
    this.audioAnalyser3.fftSize = 512;

    this.audioArray0 = new Uint8Array(this.audioAnalyser0.frequencyBinCount);
    this.audioArray1 = new Uint8Array(this.audioAnalyser1.frequencyBinCount);
    this.audioArray2 = new Uint8Array(this.audioAnalyser2.frequencyBinCount);
    this.audioArray3 = new Uint8Array(this.audioAnalyser3.frequencyBinCount);
  }

  _createPostEffects() {
    this.renderScene = new RenderPass(this.scene, this.camera);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.5,
      0.4,
      0.85
    );
    this.bloomPass.threshold = this.config.bloomPass.threshold;
    this.bloomPass.strength = this.config.bloomPass.strength;
    this.bloomPass.radius = this.config.bloomPass.radius;

    this.afterimagePass = new AfterimagePass();
    this.afterimagePass.uniforms.damp.value = this.config.afterimagePass.value;

    this.filmPass = new FilmPass(1, 0.25, 1080, false);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(this.renderScene);
    this.composer.addPass(this.afterimagePass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.filmPass);
  }

  _createScenario() {}

  onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
  }

  onMusicControl(action) {
    if (action === "play") {
      this.audioContext.resume();
    } else {
      this.audioContext.suspend();
    }

    this.musicPlayer[action]();
  }

  _initWebcam() {
    this.webcam = document.createElement("video");
    this.webcam.id = "webcam";
    this.webcam.autoplay = true;
    this.webcam.width = 640;
    this.webcam.height = 480;

    // Get image from camera
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        this.webcam.srcObject = stream;
        this._createParticles();
      })
      .catch((e) => {
        alert("ERROR: " + e.message);
      });
  }

  init(musicPlayer) {
    // this._createStats()
    this._createRenderer();
    this._createScene();
    this._createCamera();
    this._createControls();
    this._createLights();
    this._createPostEffects();
    this._createGUI();
    this._createScenario();
    this._createAudio(musicPlayer);
    this._initWebcam();

    this.renderer.setAnimationLoop(() => {
      this.animate();
    });
  }

  _animateCamera() {
    this.camera.position.set(
      this.config.camera.radius *
        Math.sin(THREE.MathUtils.degToRad(this.config.camera.theta)),
      this.config.camera.radius *
        Math.sin(THREE.MathUtils.degToRad(this.config.camera.theta)),
      this.config.camera.radius *
        Math.cos(THREE.MathUtils.degToRad(this.config.camera.theta))
    );
    this.camera.lookAt(this.scene.position);
    this.camera.updateMatrixWorld();
  }

  _animateEffects() {
    const { lowerMaxFr, overallAvg } = this._getFrequencies(
      this.audioAnalyser2,
      this.audioArray2
    );
    const reducedLowerFr = Math.pow(lowerMaxFr, 0.8);

    const bass =
      reducedLowerFr < 0.3
        ? 0.75
        : Utils.modulate(reducedLowerFr, 0, 1, 0.42, 1.67);

    const treble = Utils.modulate(overallAvg, 10, 50, 0.5, 1);

    this.afterimagePass.uniforms.damp.value = Number(treble);
    this.config.afterimagePass.value = treble;
  }

  _animateLights() {
    const { overallAvg } = this._getFrequencies(
      this.audioAnalyser3,
      this.audioArray3
    );

    const lights = Utils.modulate(overallAvg, 0, 20, 0.5, 0);
    const bloom = Utils.modulate(overallAvg, 0, 20, 1.67, 0.42);

    this.ambientLight.intensity = lights;

    this.bloomPass.strength = Number(bloom);
    this.config.bloomPass.strength = bloom;
  }

  _animateMusic() {
    this._animateEffects();
    this._animateLights();
  }

  animate() {
    this.config.camera.theta += this.config.camera.velocity;

    if (this.musicPlayer.isPlaying()) {
      this.config.lights.theta += this.config.lights.velocity;
    }

    // this._animateCamera();
    this._animateMusic();
    this._drawParticles();

    this.composer.render();

    this.stats?.update();
  }

  /**
   * [Update an basic]
   * @param {AnalyserNode} audioAnalyser - Web Audio Analyzer
   * @param {Uint8Array} audioArray - Audio frequencyBinCount
   * */
  _getFrequencies(audioAnalyser, audioArray) {
    audioAnalyser.getByteFrequencyData(audioArray);

    const length = audioArray.length;

    const lowerHalfArray = audioArray.slice(0, length / 2 - 1);
    const upperHalfArray = audioArray.slice(length / 2 - 1, length - 1);

    const overallAvg = Utils.avg(audioArray);
    const lowerMax = Utils.max(lowerHalfArray);
    const lowerAvg = Utils.avg(lowerHalfArray);
    const upperMax = Utils.max(upperHalfArray);
    const upperAvg = Utils.avg(upperHalfArray);

    const lowerMaxFr = lowerMax / lowerHalfArray.length;
    const lowerAvgFr = lowerAvg / lowerHalfArray.length;
    const upperMaxFr = upperMax / upperHalfArray.length;
    const upperAvgFr = upperAvg / upperHalfArray.length;

    return {
      overallAvg,
      lowerMaxFr,
      lowerAvgFr,
      upperMaxFr,
      upperAvgFr,
    };
  }

  /**
   * [Get image pixel data]
   * @param {HTMLVideoElement} image - Image
   * */
  _getImageData(video) {
    const w = video.width;
    const h = video.height;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = w;
    canvas.height = h;

    ctx.drawImage(video, 0, 0);

    return ctx.getImageData(0, 0, w, h);
  }
}

const vertexSource = `
attribute vec3 color;
uniform float time;
uniform float size;
varying vec3 vColor;
varying float vGray;

void main() {
    // To fragmentShader
    vColor = color;
    vGray = (vColor.x + vColor.y + vColor.z) / 3.0;

    // Set vertex size
    gl_PointSize = size * vGray * 3.0;
    // gl_PointSize = size;

    // Set vertex position
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
}
`;

const fragmentSource = `
varying vec3 vColor;
varying float vGray;

void main() {
    float gray = vGray;

    // Decide whether to draw particle
    if(gray > 0.5){
        gray = 0.0;
    }else{
        gray = 1.0;
    }

    // Set vertex color
    gl_FragColor = vec4(vColor, gray);
}
`;
