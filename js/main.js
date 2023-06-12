import Scenario from "./models/Scenario.js";
import MusicPlayer from "./models/MusicPlayer.js";
import Sample from "./models/Sample.js";

window.addEventListener("load", () => {
  const sample = new Sample("./audio/song.mp3");

  const musicPlayer = new MusicPlayer([sample]);

  const app = new Scenario("#app");
  app.init(musicPlayer);

  const playButton = document.getElementById("play");
  playButton.addEventListener("click", () => app.onMusicControl("play"));

  const pauseButton = document.getElementById("pause");
  pauseButton.addEventListener("click", () => app.onMusicControl("pause"));

  const stopButton = document.getElementById("stop");
  stopButton.addEventListener("click", () => app.onMusicControl("stop"));

  window.addEventListener("resize", () => app.onWindowResize());
  document.addEventListener("mousemove", (event) => app.onMouseMove(event));

});
