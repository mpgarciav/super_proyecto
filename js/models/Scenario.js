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
    this.frequencies = null;
    this.constants = {
      width: window.innerWidth,
      height: window.innerHeight,
      normalization: 100,
    }
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
        gap: 0.2,
      },
      camera: {
        theta: 0,
        velocity: 0.1,
        radius: 10,
        focalLength: 1,
        mouseX: 0,
        mouseY: 0,
      },
      lights: {
        theta: 0,
        velocity: 1,
        radius: 400,
      },
      particles: {
        scale: 15,
        velocity: 1,
        growthFactor: {
          max: 50,
          min: 0,
          value: 0,
        },
      },
      bloomPass: {
        exposure: 0.7619,
        strength: 1.8,
        threshold: 1,
        radius: 0.57,
      },
      afterimagePass: {
        value: 0,
      },
      filmPass: {
        noiseIntensity: 0,
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

    const afterImageEffect = this.gui.addFolder("After image");
    afterImageEffect.close();

    this.afterimagePass.uniforms.damp.value = this.config.afterimagePass.value;

    afterImageEffect
      .add(this.config.afterimagePass, "value", 0.0, 1.0)
      .onChange((value) => {
        this.afterimagePass.uniforms.damp.value = Number(value);
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
    // this.scene.background = new THREE.Color(0xffffff)
  }

  _createCamera() {
    this.camera = new CinematicCamera(
      75,
      window.innerWidth / window.innerHeight,
      1,
      2000
    );
    this.camera.setLens(this.config.camera.focalLength);
    this.camera.position.y = 100;
    // this.scene.add(this.camera)
  }

  _createControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableZoom = true;
  }

  _createLights() {
    // this.ambientLight = new THREE.AmbientLight(0xffffff, 0);
    // this.scene.add(this.ambientLight);
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

  _createParticles() {
    const imageData = this._getImageData(this.webcam);

    const geometry = new THREE.BufferGeometry();
    const vertices_base = [];
    const colors_base = [];

    const width = imageData.width;
    const height = imageData.height;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const posX = -x + width / 2;
        const posY = 0;
        const posZ = y - height / 2;
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
          value: this.config.particles.scale,
        },
      },
      vertexShader: vertexSource,
      fragmentShader: fragmentSource,
      transparent: true,
      // depthWrite: false,
      // blending: THREE.MultiplyBlending,
    });

    this.particlesPlane = new THREE.Points(geometry, material);
    // this.particlesPlane.rotation.y = -Math.PI/2;
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

        particles.geometry.attributes.position.setY(
          i,
          (1 - gray) * this.config.particles.growthFactor.value
        );
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

    const sample1 = this.audioContext.createMediaElementSource(
      this.samples[0].element
    );

    this.audioAnalyser1 = this.audioContext.createAnalyser();

    sample1.connect(this.audioAnalyser1);

    this.audioAnalyser1.connect(this.audioContext.destination);

    this.audioAnalyser1.fftSize = 2048;

    this.audioArray1 = new Uint8Array(this.audioAnalyser1.frequencyBinCount);
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
    // this.composer.addPass(this.afterimagePass);
    // this.composer.addPass(this.bloomPass);
    // this.composer.addPass(this.filmPass);
  }

  _createScenario() { }


  _initWebcam() {
    this.webcam = document.createElement("video");
    this.webcam.id = "webcam";
    this.webcam.autoplay = true;
    this.webcam.width = 96;
    this.webcam.height = 54;

    // Get image from camera
    navigator.mediaDevices
      .getUserMedia({
        video: { width: this.webcam.width, height: this.webcam.height },
        audio: false,
      })
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
    // this._createControls();
    this._createLights();
    this._createPostEffects();
    this._createGUI();
    this._createScenario();
    this._createAudio(musicPlayer);
    this._initWebcam();

    this.renderer.setAnimationLoop(() => this._animate());
  }

  _animateCamera() {
    const {height,width,normalization} = this.constants
    this.camera.position.x += (this.config.camera.mouseX + - this.camera.position.x) * .05;
    this.camera.position.y += (-this.config.camera.mouseY- this.camera.position.y) *1;
    this.camera.lookAt(this.scene.position);
    this.camera.updateMatrixWorld();
  }

  _animateEffects() {
    const { overallAvg } = this.frequencies;
    const { min: minGrowthFactor, max: maxGrowthFactor } =
      this.config.particles.growthFactor;

    // const reducedLowerFr = Math.pow(lowerMaxFr, 0.8);

    this.config.particles.growthFactor.value = Utils.modulate(
      overallAvg,
      0,
      100,
      minGrowthFactor,
      maxGrowthFactor
    );

    /*     const treble = Utils.modulate(overallAvg, 10, 50, 0.5, 1);

    this.afterimagePass.uniforms.damp.value = Number(treble);
    this.config.afterimagePass.value = treble; */
  }

  _animateLights() {
    const { overallAvg } = this._getFrequencies(
      this.audioAnalyser1,
      this.audioArray1
    );

    const lights = Utils.modulate(overallAvg, 0, 20, 0.5, 0);
    const bloom = Utils.modulate(overallAvg, 0, 20, 1.67, 0.42);

    // this.ambientLight.intensity = lights;

    this.bloomPass.strength = Number(bloom);
    this.config.bloomPass.strength = bloom;
  }

  _animateMusic() {
    this._animateEffects();
    // this._animateLights();
  }

  _animate() {

    if (this.musicPlayer.isPlaying()) {
      this.config.lights.theta += this.config.lights.velocity;

    }

    this._animateCamera();
    this._getMusicFrequencies();
    this._animateMusic();
    this._drawParticles();

    this.composer.render();
    this.stats?.update();

  }

  _getMusicFrequencies() {
    this.audioAnalyser1.getByteFrequencyData(this.audioArray1);

    const length = this.audioArray1.length;

    const lowerHalfArray = this.audioArray1.slice(0, length / 2 - 1);
    const upperHalfArray = this.audioArray1.slice(length / 2 - 1, length - 1);

    const overallAvg = Utils.avg(this.audioArray1);
    const lowerMax = Utils.max(lowerHalfArray);
    const lowerAvg = Utils.avg(lowerHalfArray);
    const upperMax = Utils.max(upperHalfArray);
    const upperAvg = Utils.avg(upperHalfArray);

    const lowerMaxFr = lowerMax / lowerHalfArray.length;
    const lowerAvgFr = lowerAvg / lowerHalfArray.length;
    const upperMaxFr = upperMax / upperHalfArray.length;
    const upperAvgFr = upperAvg / upperHalfArray.length;

    this.frequencies = {
      overallAvg,
      lowerMaxFr,
      lowerAvgFr,
      upperMaxFr,
      upperAvgFr,
    };
  }

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

  onMouseMove(event) {
    const {width,height,normalization} = this.constants
    this.config.camera.mouseX = (event.clientX - width / 2) / normalization;
    this.config.camera.mouseY = (event.clientY - height / 2) / normalization;
    
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
    // gl_PointSize = size * vGray * 3.0;
    gl_PointSize = size*((0.5 * vGray) + 0.5);

    // Set vertex position
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
}
`;

const fragmentSource = `
varying vec3 vColor;
varying float vGray;

void main() {
    float gray = 1. - vGray;
    // Set vertex color
    gl_FragColor = vec4(vColor, 1);
}
`;
