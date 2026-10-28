/* Loads the settings file, the Firebase SDK (and Three.js for 3D games), then sg.js.
   Usage in a game page:  <script src="../../shared/boot.js" data-libs="firebase,three"></script>
   Scripts are written synchronously so they run in order before the game's own code. */
(function(){
  var me = document.currentScript;
  var base = me.src.replace(/boot\.js(\?.*)?$/, '');
  var libs = (me.getAttribute('data-libs') || 'firebase').split(',').map(function(s){ return s.trim(); });
  function w(url){ document.write('<script src="' + url + '"><\/script>'); }
  w(base + 'firebase-config.js');
  if(libs.indexOf('firebase') !== -1){
    w('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
    w('https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore-compat.js');
    w('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-check-compat.js');
  }
  if(libs.indexOf('three') !== -1){
    w('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
    w('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js');
  }
  w(base + 'sg.js');
})();
