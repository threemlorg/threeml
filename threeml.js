//import { isNumeric } from 'jquery';
import * as THREE from './build/three.module.js';
import { GLTFLoader } from './controls/GLTFLoader.js';
import { CSS3DObject, CSS3DRenderer } from './renderers/CSS3DRenderer.js';
import { DefaultFont } from './fonts/defaultfont.js'
import { VRButton } from './controls/VRButton.js';
import { GUI } from './controls/dat.gui.module.js';
import { FlyControls } from './controls/FlyControls.js';
import { Reflector } from './controls/Reflector.js';

/**
 * Based on http://www.v-slam.org/
 */

var ThreeScenes = []
var camera;
var scene;
var rendererCSS;
var renderer;
var mixer = null;
var clock = new THREE.Clock();
var controls;

var ThreeML = function (element) {
	const loader = new GLTFLoader();
	const defaultFont = new DefaultFont();
	var defaultLookat;
	var navigating;
	var previousNavigation;
	var scenes = [];
	const cameraMaxXangleDef = 0.3;
	const cameraMaxYangleDef = 0.5;
	var cameraMaxXangle = cameraMaxXangleDef;
	var cameraMaxYangle = cameraMaxYangleDef;
	var self = this;
	let gui;
	function createGUI() {

		if (gui) {
			gui.destroy();
		}

		gui = new GUI({ width: 350 });
	}

	window.addEventListener('resize', onWindowResize, false);
	document.onmousemove = handleMouseMove;

	var selectedObject;

	this.getScene = function () {
		return scene;
	}
	this.getCamera = function () {
		return camera;
	}
	this.getRenderer = function () {
		return renderer;
	}
	this.getRendererCss = function () {
		return rendererCSS;
	}

	this.show = function (objectName, doShow = true) {
		for (var n = 0; n < scenes.length; n++) {
			var scene = scenes[n];
			var object = scene.getObjectByName(objectName);
			doShowObject(object, doShow);
		}
	}
	function doShowObject(object, doShow) {
		if (object) {
			object.visible = doShow;
			var disp = doShow ? '' : 'none';
			for (var n = 0; n < object.children.length; n++) {
				doShowObject(object.children[n], doShow);
			}


		}
	}
	this.toggle = function (objectName) {
		for (var n = 0; n < scenes.length; n++) {
			var scene = scenes[n];
			var object = scene.getObjectByName(objectName);
			var show = !object.visible;
			if (object) {
				doShowObject(object, show);

			}
		}
	}
	this.showFromGroup = function (groupName, objectName) {
		for (var n = 0; n < scenes.length; n++) {
			var scene = scenes[n];
			var group = scene.getObjectByName(groupName);
			if (group) {
				for (var m = 0; m < group.children.length; m++) {
					var object = group.children[m];
					doShowObject(object, object.name == objectName);
				}
			}
		}
	}
	this.present = function (objectName, doPresent = undefined) {
		var obj = scene.getObjectByName(objectName);
		if (obj && obj.present) {
			if (!doPresent) {
				if (obj.presentProp) {
					//doPresent = !obj.presentProp.isPresenting
				}
				else {
					doPresent = true;
				}
			}
			obj.present(doPresent);
		}
	}
	this.presentFromGroup = function (groupName, objectName) {
		for (var n = 0; n < scenes.length; n++) {
			var scene = scenes[n];
			var group = scene.getObjectByName(groupName);
			if (group) {
				for (var m = 0; m < group.children.length; m++) {
					var obj = group.children[m];
					if (obj.present) {
						obj.present(obj.name == objectName);
					}
				}
			}
		}
	}
	this.clearChildren = function (objName) {
		var group = scene.getObjectByName(objName);
		if (group) {
			for (var n = 0; n < group.children.length; n++) {

				doClearChildren(group.children[n]);
			}

		}
	}

	function doClearChildren(obj) {
		if (obj) {
			for (var n = 0; n < obj.children.length; n++) {
				clearCh(obj.children[n]);
			}

		}
	}
	function clearCh(obj) {
		if (obj) {
			for (var n = 0; n < obj.children.length; n++) {
				clearCh(obj.children[n]);
			}
			if (obj.geometry) {
				obj.geometry.dispose();
			}
			var p = obj.parent;
			p.remove(obj);
		}
	}
	this.clearGoupChildren = function (objName) {
		var group = scene.getObjectByName(objName);
		doClearGoupChildren(group);
	}
	function doClearGoupChildren(group) {
		while (group.children.length > 0) {
			doClearGoupChildren(group.children[0]);
			group.remove(group.children[0]);
		}
	}
	this.loadCodeInGroup = function (groupName, code, replace = true) {
		var group = scene.getObjectByName(groupName);
		var domgroup = document.getElementsByName(groupName);
		if (group && domgroup) {
			domgroup[0].innerHTML = code;
			var threeScene = ThreeScenes[0];
			if (replace) {
				doClearGoupChildren(group);
			}
			threeScene.parseChildren(domgroup[0], group);
		}
	}
	this.loadInTarget = function (targetName, url, replace = true) {
		return this.loadInGroup(targetName, url, replace);
	}
	this.loadInGroup = function (targetName, url, replace = true) { //Deprecated: use loadInTarget()
		var group = scene.getObjectByName(targetName);
		var domgroup = document.getElementsByName(targetName);
		if (group && domgroup) {
			if (domgroup.length === 2 && domgroup[1].localName === "iframe") {
				domgroup[1].src = url;
			}
			else {
				let xhr = new XMLHttpRequest();
				xhr.open('get', url);
				xhr.send();
				xhr.onload = function () {
					if (xhr.status != 200) { // analyze HTTP status of the response
						alert(`Error ${xhr.status}: ${xhr.statusText}`); // e.g. 404: Not Found
					} else { // show the result
						var r = xhr.response;
						domgroup[0].innerHTML = r;
						var threeScene = ThreeScenes[0];
						if (replace) {
							doClearGoupChildren(group);
						}
						threeScene.parseChildren(domgroup[0], group);
					}
				};
				xhr.onerror = function () {
					alert("Request failed");
				};
			}
		}
	}


	//////////////////////////////////////////
	//Global event handling
	//var raycaster = new THREE.Raycaster();
	//var mouse = new THREE.Vector2();
	var mousePos;
	var lastMousePos;
	var allObjects = [];
	var avatarheight = 1.7;
	var rayCastDirection;
	//var cameraTarget;
	function onWindowResize() {

		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();

		rendererCSS.setSize(window.innerWidth, window.innerHeight);
		renderer.setSize(window.innerWidth, window.innerHeight);
	}
	function getPoint(obj) {
		if (obj.point) {
			return obj.point;
		}
		return getPointFromChildren(obj);
	}
	function getPointFromChildren(obj) {

		for (var n = 0; n < obj.children.length; n++) {
			if (obj.children[n].point) {
				return obj.children[n].point;
			}
			var point = getPointFromChildren(obj.children[n]);
			if (point) {
				return point;
			}
		}
	}
	var mouseDown = false;
	function onMouseDown(event) {
		selectedObject = getRayCastedObject();
		hideIframe(selectedObject);
		mouseDown = true;
		if (cursor3d && !cursor3d.visible) {
			var p;
			if (selectedObject && selectedObject.point) {
				p = selectedObject.point;
			}
			else if (mouseDirection) {
				var l = cursor3d.position.distanceTo(camera.position);
				p = mouseDirection.normalize().clone().multiplyScalar(l);
			}
			if (p) {
				cursor3d.position.set(p.x, p.y, p.z);

			}
			cursor3d.visible = true;
		}
	}
	function onMouseUp(event) {
		mouseDown = false;
		if (selectedObject) {
			hideIframe(selectedObject, true);

			if (selectedObject.eventParent) {
				selectedObject = selectedObject.eventParent;
			}
			if (selectedObject.presentProp && !selectedObject.presentProp.isPresenting) {
				selectedObject.presentProp.defaultPosition = selectedObject.position.clone();
			}
		}
		else if (navigating == CameraMode.CLICK && rayCastDirection) {
			cameraTarget = camera.position.clone().add(rayCastDirection.multiplyScalar(100));
		}
		selectedObject = undefined;
		lastMousePos = undefined;
		if (cursor3d) {
			cursor3d.visible = false;
		}

	}
	function hideIframe(selectedObject, show = false) {
		if (selectedObject) {
			var p = selectedObject.eventParent;
			if (p && p.children && p.children.length > 0) {
				var css3d = p.children[0];
				if (css3d.element && css3d.element.children && css3d.element.children.length > 1) {
					var ifr = css3d.element.children[1];
					if (ifr.localName == 'iframe') {
						ifr.style.display = show ? 'block' : 'none';
					}
				}
			}
		}
	}
	function onDocumentMouseClick(event) {
		var intersected = getRayCastedObject();
		if (intersected) {
			if (intersected.eventParent) {
				intersected = intersected.eventParent;
			}
			if (intersected.callback) {
				event.preventDefault();
				intersected.callback('click');
			}
			else if (intersected.walk) {
				var point = getPoint(intersected)
				if (!point) { return; }
				camera.targetPosition = new THREE.Vector3(point.x, point.y + avatarheight, point.z);
				checkObjectUpdateArray(camera);
				var f = function () {
					if (camera.targetPosition) {
						if (camera.position.distanceTo(camera.targetPosition) < 0.1) {
							//camera.position.set(camera.targetPosition.clone());
							camera.targetPosition = undefined;
						}
						else {
							camera.position.lerp(camera.targetPosition, 0.01);
						}
					}
				}
				camera.updateArray.push(f);
			}
		}
	}
	function checkObjectUpdateArray(obj) {
		if (!obj.updateArray) {
			obj.updateArray = [];
			obj.update = function () {
				for (var n = 0; n < obj.updateArray.length; n++) {
					obj.updateArray[n].call(obj);
				}
			}
		}
	}
	function getMousePos(event) {
		event = event || window.event; // IE-ism
		var lmousePos = {
			x: event.clientX,
			y: event.clientY
		};
		return lmousePos;
	}
	function handleMouseMove(event) {
		var dot, eventDoc, doc, body, pageX, pageY;

		mousePos = getMousePos(event)
		if ((selectedObject || (cursor3d && cursor3d.visible)) && lastMousePos) {
			var divx = lastMousePos.x - mousePos.x;
			var divy = lastMousePos.y - mousePos.y;
			mouseDivX = -0.01 * divx;
			mouseDivY = 0.01 * divy;
		}
		if (selectedObject && selectedObject.position && lastMousePos && (selectedObject.draggable || (selectedObject.eventParent && selectedObject.eventParent.draggable))) {

			if (selectedObject.eventParent) {
				selectedObject.eventParent.position.x += mouseDivX;
				selectedObject.eventParent.position.y += mouseDivY;
			}
			else {
				selectedObject.position.x += mouseDivX;
				selectedObject.position.y += mouseDivY;
			}
		}
		if (cursor3d && cursor3d.visible) {
			cursor3d.position.x += mouseDivX;
			if (ctrlKey) {
				cursor3d.position.z -= mouseDivY;
			}
			else {
				cursor3d.position.y += mouseDivY;
			}
		}
		lastMousePos = mousePos;
		check3dLinkForCursor();
	}
	var ctrlKey = false;
	var mouseDivX = 0;
	var mouseDivY = 0;
	var cursor3d;
	function getTheMousePos() {
		var mouse = new THREE.Vector2();
		mouse.x = (mousePos.x / window.innerWidth) * 2 - 1;
		mouse.y = - (mousePos.y / window.innerHeight) * 2 + 1;
		return mouse;

	}
	var mouseDirection;
	function getRayCastedObject() {
		var raycaster = new THREE.Raycaster();
		var mouse = getTheMousePos();
		raycaster.setFromCamera(mouse, camera);
		mouseDirection = raycaster.ray.direction;
		var intersects = raycaster.intersectObjects(allObjects);
		rayCastDirection = raycaster.ray.direction;
		if (intersects.length > 0 && intersects[0].object) {
			intersects[0].object.point = intersects[0].point;
			return intersects[0].object;
		}
	}
	function fillAllObjects() {
		allObjects = [];
		scene.traverse(function (child) { allObjects.push(child); });
	}
	var hoverObject;
	function check3dLinkForCursor() {
		var intersected = getRayCastedObject();
		var c = 'default';
		if (intersected) {
			if (intersected.eventParent) {
				intersected = intersected.eventParent;
			}
			if (intersected.present || intersected.callback) {

				c = 'pointer';
			}
			else if (intersected.walk) {
				c = 'url(/steps.cur),auto';
			}
			if (intersected.callback) {
				intersected.callback('hover');
			}
		}
		document.body.style.cursor = c;
		if (hoverObject && hoverObject.o != intersected) {
			clearHover();
		}
	}
	function clearHover() {
		if (hoverObject && hoverObject.o) {
			var a = hoverObject.o.hoveractions;
			if (hoverObject.t) {
				hoverObject.t.visible = false;
			}
			if (hoverObject.o.defaultScale) {
				hoverObject.o.scale.set(hoverObject.o.defaultScale.x, hoverObject.o.defaultScale.y, hoverObject.o.defaultScale.z);
				hoverObject.o.scaled = false;
			}
			if (hoverObject.o.defaultColor) {
				hoverObject.o.material.color = hoverObject.o.defaultColor;
				hoverObject.o.colored = false;
			}
			hoverObject = undefined;
		}
	}
	//////////////////////////////////////////

	function CheckZoom() {
		let zoom = ((window.outerWidth - 10) / window.innerWidth) * 100;
		if (zoom < 85) {
			var d = document.createElement('div');
			d.style.position = 'absolute';
			d.style.display = 'block';
			d.style.fontSize = '30px';
			d.style.zindex = 10000;
			d.style.color = 'white';
			d.style.left = '100px';
			d.style.top = '100px';
			d.style.backgroundColor = 'black';
			d.style.padding = '20px';
			d.style.width = '80vw';
			var p = document.createElement('div');
			p.innerText = 'Please set the zoom of your browser to at least 100% and then reload this page. Otherewise some ThreeML functions might not work correctly';
			d.appendChild(p);
			var ad = document.createElement('div');
			ad.style.marginTop = '30px';
			var a = document.createElement('a');
			a.href = "javascript:location.reload(true/false);";
			a.innerText = "Refresh page";
			ad.appendChild(a);
			d.appendChild(ad);
			document.body.appendChild(d);
		}
	}

	CheckZoom();



	this.parseThree = function (htmlParent) {
		if (!htmlParent) {
			htmlParent = document;
		}
		var threeParts = htmlParent.getElementsByTagName('three');
		for (var n = 0; n < threeParts.length; n++) {
			var threeScene;
			if (ThreeScenes.length == 0) {
				threeScene = new ThreeScene(threeParts[n], htmlParent);
				ThreeScenes.push(threeScene);
			}
			else {
				threeScene = ThreeScenes[0];
			}
			threeScene.parseChildren(threeParts[n]);
			camera.updateMatrixWorld();
		}
	}


	var ThreeScene = function (threenode, htmlParent) {
		var controls;
		var materials = [];
		var canvaszindex = 0;
		var audioContext;

		init(threenode, htmlParent);
		animate();

		function init(X3Dnode, htmlParent) {
			var container = X3Dnode.parentNode;

			var innerWidth = window.innerWidth;
			var innerHeight = window.innerHeight;
			if (htmlParent.localName == 'div') {
				innerWidth = parseFloat(htmlParent.style.width);
				innerHeight = parseFloat(htmlParent.style.height);
			}

			camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.01, 2000);
			//camera = new THREE.OrthographicCamera(-0.5 * innerWidth, 0.5 * innerWidth, -0.5 * innerHeight, 0.5 *innerHeight, 0.1, 20000);
			//camera.position.set(0, 0, 10);
			//container.style.pointerEvents = 'none';
			scene = new THREE.Scene();
			scenes.push(scene);
			camera.position.set(0, 0, 0);
			camera.eulerOrder = "YXZ";
			navigating = CameraMode.FIXED;
			rendererCSS = new CSS3DRenderer();
			rendererCSS.setSize(innerWidth, innerHeight);
			container.appendChild(rendererCSS.domElement);


			// put the mainRenderer on top
			renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
			renderer.setClearColor(0x000000, 0);
			renderer.domElement.style.position = 'absolute';
			renderer.domElement.style.top = 0;
			renderer.domElement.style.zIndex = 1;
			renderer.setSize(innerWidth, innerHeight);
			renderer.xr.enabled = true;
			renderer.shadowMapEnabled = true;
			rendererCSS.domElement.appendChild(renderer.domElement);


			//document.body.appendChild(VRButton.createButton(rendererMain));
			window.addEventListener('click', onDocumentMouseClick, false);
			document.addEventListener("mousedown", onMouseDown);
			document.addEventListener("mouseup", onMouseUp);
			document.addEventListener('keyup', (event) => {
				ctrlKey = false;
			});
			document.addEventListener('keydown', (event) => {
				if (event.key == 'F2') {
					if (maintree) {
						clearDatGui();
						if (previousNavigation) {
							navigating = previousNavigation;
						}
					}
					else {
						parseScene(scene);
						previousNavigation = navigating;
						navigating = CameraMode.FIXED;
					}
				}
				else if (event.code == 'Space' && cursor3d) {
					fixHandle = FixHandle.TOGGLE;
				}
				else if (event.code == 'ControlLeft') {
					ctrlKey = true;
				}
			});

		}
		//var ctrlKey = false;
		var fixHandle = FixHandle.NONE;

		this.parseChildren = function (threenode, group) {
			if (!group) {
				group = scene;
			}
			doParseChildren(threenode, group);
		}
		var waitModel;
		function handleWaitObject(ele, parent) {
			var att = getAttributes(ele);
			if (att.url) {
				const gltfLoader = new GLTFLoader();
				gltfLoader.load(att.url, (gltf) => {
					waitModel = gltf.scene;
					setCommonAttributes(waitModel, att);
					checkevents(ele, waitModel);
					var visible = toB(att.visible);
					waitModel.visible = visible;
					parent.add(waitModel);
				});
			}
		}
		function showWaitModel(parent, p) {
			if (waitModel) {
				if (p) {
					waitModel.position.set(p.x, p.y, p.z);
					parent.add(waitModel);
				}
				waitModel.visible = true;
			}
		}
		function hideWaitModel(parent) {
			if (waitModel) {
				parent.remove(waitModel);
				waitModel.false = true;
			}
		}
		function animate() {
			renderer.setAnimationLoop(doAnimate);
			//requestAnimationFrame(animate);
			//doAnimate();
		}

		function doAnimate() {
			fillAllObjects();
			checkCam();
			scene.traverse(obj => {
				if (typeof obj.update === 'function' && obj.type != 'CubeCamera') {
					obj.update();

				}
				if (obj.material && obj.material.envMap) {
					obj.visible = false;
					cubeCamera.position.set(obj.position.x, obj.position.y, obj.position.z);
					cubeCamera.update(renderer, scene);
					obj.visible = true;
				}
				simulateSoftBody(obj);
			});
			fixHandle = FixHandle.NONE;

			if (camera.update) {
				camera.update();
			}
			if (controls) {
				const delta = clock.getDelta();
				controls.movementSpeed = 1;
				controls.update(delta);
			}

			rendererCSS.render(scene, camera);
			renderer.render(scene, camera);

		}
		var mouseobj;
		function checkCam() {

			if (navigating == CameraMode.DRAG) {
				if (mouseDown) {
					if (!mouseobj) {
						mouseobj = new THREE.Object3D();
						camera.lookAt(mouseobj);
					}
					var raycaster = new THREE.Raycaster();
					var mouse = getTheMousePos();
					raycaster.setFromCamera(mouse, camera);
					var raydirection = raycaster.ray.direction;
					var p = camera.position.clone();
					raydirection.multiplyScalar(10);
					p.add(raydirection)
					mouseobj.position.set(p.x, p.y, p.z);

				}

				return
			}
			if (navigating != CameraMode.FIXED) {
				var lmousePos = mousePos;

				if (lmousePos && defaultLookat) {
					var intersected = getRayCastedObject();
					if (intersected && ((intersected.geometry && intersected.geometry.type == 'PlaneGeometry')
						|| (intersected.present || intersected.callback))) {
						return;
					}
					var x = lmousePos.x - (0.5 * window.innerWidth) + defaultLookat.x;
					var y = lmousePos.y - (0.5 * window.innerHeight) + defaultLookat.y;
					//console.log('mousex:' + mousePos.x + ' x:' + x);
					var fact = 0.05;
					x = -fact * x;
					y = fact * y;

					var speedx = (x ** 2) ** 2 / (window.screen.width ** 2) ** 2;
					var speedy = (y ** 2) ** 2 / (window.screen.height ** 2) ** 2;
					if ((camera.rotation.x > cameraMaxXangle && y < 0) || (camera.rotation.x < -cameraMaxXangle && y > 0)) {
						y = 0;
					}
					if ((navigating == CameraMode.LOOKAT) && ((camera.rotation.y > cameraMaxXangle && x > 0) || (camera.rotation.y < -cameraMaxXangle && x < 0))) {
						if (camera.rotation.y > cameraMaxYangle || camera.rotation.y < -cameraMaxYangle) {
							x = 0;
						}
						else if (Math.abs(camera.rotation.y) > cameraMaxXangle) {
							x = 100 * x / Math.abs(toDg(camera.rotation.y) ** 2);
						}
					}
					camera.rotation.x -= 500 * speedy * y;
					camera.rotation.y += 500 * speedx * x;

				}
				else {
					var vector = new THREE.Vector3(0, 0, -100);
					vector.applyQuaternion(camera.quaternion);
					//console.log(vector);
					defaultLookat = vector;
				}
			}
		}


		function rotateCameraToObject(position, t) {
			var object3Ds = new THREE.Object3D();
			// set dummyObject's position, rotation and quaternion the same as the camera
			object3Ds.position.set(position.x, position.y, position.z);
			var targetQuaternion = getTargetQuaternionForSlerp(object3Ds);
			camera.quaternion.slerp(targetQuaternion, t);
		}

		function getTargetQuaternionForSlerp(target) {
			var cameraPosition = camera.position.clone();               // camera original position
			var cameraRotation = camera.rotation.clone();               // camera original rotation
			var cameraQuaternion = camera.quaternion.clone();           // camera original quaternion
			var dummyObject = new THREE.Object3D();
			// set dummyObject's position, rotation and quaternion the same as the camera
			dummyObject.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
			dummyObject.rotation.set(cameraRotation.x, cameraRotation.y, cameraRotation.z);
			dummyObject.quaternion.set(cameraQuaternion.x, cameraQuaternion.y, cameraQuaternion.z);
			// lookAt object3D
			dummyObject.lookAt(target);
			// store its quaternion in a variable
			return dummyObject.quaternion.clone();
		}


		//Common tags
		function doParseChildren(ele, parent) {
			for (var n = 0; n < ele.children.length; n++) {
				checkEle(ele.children[n], parent);
			}

		}
		function checkEle(ele, parent) {
			var name = ele.localName.toLowerCase();

			console.log(name);
			var tr = parent;
			switch (name) {

				case 'camera':
					return handleCamera(ele, parent);
					break;
				case 'renderer':
					handleRenderer(ele);
					break;
				case 'scene':
					handleScene(ele);
					break;
				case 'canvas':
					handleCanvas(ele);
					break;
				case 'waitobject':
					return handleWaitObject(ele, parent);
					break;
				case 'planegeometry':
				case 'planebuffergeometry':
					return handlePlaneGeometry(ele, parent);
					break;
				case 'parametricgeometry':
				case 'parametricbuffergeometry':
					return handleParametricBufferGeometry(ele, parent);
					break;
				case 'spheregeometry':
				case 'spherebuffergeometry':
					return handleSphereGeometry(ele, parent);
					break;
				case 'boxgeometry':
				case 'boxbuffergeometry':
					return handleBoxGeometry(ele, parent);
					break;
				case 'reflector':
					return handleReflector(ele, parent);
				case 'circlegeometry':
					return handleCircleGeometry(ele, parent);
					break;
				case 'conegeometry':
					return handleConeGeometry(ele, parent);
					break;
				case 'torusgeometry':
					return handleTorusGeometry(ele, parent);
					break;
					handleTorusGeometry
				case 'cylindergeometry':
					return handleCylinderGeometry(ele, parent);
					break;


				case 'htmlplanegeometry':
					return handleHtmlPlaneGeometry(ele, parent);
					break;
				case 'gltfloader':
					return handleGltfLoader(ele, parent);
					break;
				case 'directionallight':
					return handleDirectionalLight(ele, parent);
					break;
				case 'pointlight':
					return handlePointLight(ele, parent);
					break;
				case 'hemispherelight':
					return handleHemisphereLight(ele, parent);
				case 'ambientlight':
					return handleAmbientLight(ele, parent);
					break;
				case 'textgeometry':
					return handleTextGeometry(ele, parent);
				case 'skybox':
					return handleSkyBox(ele);

				case 'spotlight':
					return handleSpotLight(ele, parent);
					break;

				case 'group':
					tr = handleGroup(ele, parent);
					break;
				case 'line':
					return handleLine(ele, parent);
				case 'datgui':
					return handleDatGui(ele, parent);
				case 'media':
					return handleMediaObject(ele);


					break;
				case 'fog':
					return handleFog(ele);
				case 'flycontrols':
					return handleFlyControls(ele);
				case 'cursor3d':
					return handleCursor3d(ele);

			}
			doParseChildren(ele, tr);
		}
		function getWorldPosition(obj) {
			obj.updateMatrixWorld();
			var p = new THREE.Vector3();
			p.setFromMatrixPosition(obj.matrixWorld);
			return p;
		}
		function handleMediaObject(ele) {
			var att = getAttributes(ele);
			if (att.suspend && toB(att.suspend) && audioContext) {
				audioContext.suspend();
			}
		}
		function activateAudio(obj, att) {
			if (att.url) {
				if (!audioContext) {
					audioContext = new AudioContext();

					// Create a AudioGainNode to control the main volume.
					var mainVolume = audioContext.createGain();
					// Connect the main volume node to the context destination.
					mainVolume.connect(audioContext.destination);
					if (att.volume) {
						mainVolume.gain.value = toN(att.volume);
					}
					// Create an object with a sound source and a volume control.
					obj.sound = {};
					obj.sound.source = audioContext.createBufferSource();
					obj.sound.volume = audioContext.createGain();

					if (att.volumetric && toB(att.volumetric)) {
						var panner = audioContext.createPanner();
						panner.panningModel = 'HRTF';
						obj.sound.panner = panner;
						// Instead of hooking up the volume to the main volume, hook it up to the panner.
						obj.sound.volume.connect(obj.sound.panner);
						//// And hook up the panner to the main volume.
						obj.sound.panner.connect(mainVolume);
						obj.sound.source.connect(obj.sound.volume);
						var p = getWorldPosition(obj);

						obj.sound.panner.setPosition(p.x, p.y, p.z);
					}
					else {

						// Connect the sound source to the volume control.
						obj.sound.source.connect(obj.sound.volume);
						// Hook up the sound volume control to the main volume.
						obj.sound.volume.connect(mainVolume);
					}

					// Make the sound source loop.
					var loop = false;
					if (att.loop) {
						loop = toB(att.loop);
					}
					obj.sound.source.loop = loop;

					// Load a sound file using an ArrayBuffer XMLHttpRequest.
					var request = new XMLHttpRequest();
					request.open("GET", att.url, true);
					request.responseType = "arraybuffer";
					request.onload = function (e) {

						// Create a buffer from the response ArrayBuffer.
						audioContext.decodeAudioData(this.response, function onSuccess(buffer) {
							obj.sound.buffer = buffer;

							// Make the sound source use the buffer and start playing it.
							obj.sound.source.buffer = obj.sound.buffer;
							obj.sound.source.start(audioContext.currentTime);
						}, function onFailure() {
							alert("Decoding the audio buffer failed");
						});
					};
					request.send();
				}
				else {
					if (audioContext.state == 'running') {
						audioContext.suspend();
					}
					else {
						audioContext.resume();
					}
				}
			}
		}
		function getRandowmName() {
			return "name_" + Math.random();
		}
		function clearDatGui() {
			if (maintree) {
				document.body.removeChild(maintree);
				maintree = undefined;
			}
			if (gui) {
				try {
					gui.destroy();
				}
				catch (e) { }
			}
		}
		function handleDatGui(ele, parent) {
			var att = getAttributes(ele);
			if (att.clear && toB(att.clear)) {

				clearDatGui();
			}
			else {
				parseScene(scene);
			}

		}
		function highVectorValue(v) {
			var r = 0;
			if (v) {
				var x = Math.abs(v.x);
				var y = Math.abs(v.y);
				var z = Math.abs(v.z);
				r = x > y ? x : y;
				r = r > z ? r : z;
			}
			return r;
		}
		function highValue(v) {
			var r = v;
			if (r == 0) { r = 1; }
			return r * 5 * guifact;
		}
		var guifact = 1;
		function showGui(guiElement, name) {
			if (guiElement) {
				createGUI();
				if (renderer.clearColor) {
					const folder2 = gui.addFolder('Renderer')
					var conf = { color: renderer.getClearColor().getHex() };
					folder2.addColor(conf, 'color').onChange(function (colorValue) {
						renderer.setClearColor(colorValue);
					});
				}

				scene.traverse(function (child) {
					if (child.id == guiElement) {
						const folder = gui.addFolder(name)
						if (child.position) {
							var f = highValue(highVectorValue(child.position));
							folder.add(child.position, 'x').min(-f).max(f).step(0.01);
							folder.add(child.position, 'y').min(-f).max(f).step(0.01);
							folder.add(child.position, 'z').min(-f).max(f).step(0.01);
						}
						if (child.rotation) {
							folder.add(child.rotation, 'x').min(-Math.PI).max(Math.PI).step(0.01);
							folder.add(child.rotation, 'y').min(-Math.PI).max(Math.PI).step(0.01);
							folder.add(child.rotation, 'z').min(-Math.PI).max(Math.PI).step(0.01);
						}
						if (child.scale) {
							var cs = child.scale.x;
							var f = highValue(highVectorValue());
							var conf = { scale: cs };

							folder.add(conf, 'scale').min(0.1 * cs).max(f).step(0.001).onChange(function (sv) {
								child.scale.x = sv;
								child.scale.y = sv;
								child.scale.z = sv;
							});
							//folder.add(child.scale, 'y').min(0.01).max(10).step(0.001);
							//folder.add(child.scale, 'z').min(0.01).max(10).step(0.001);
						}
						if (child.intensity) {
							var f = highValue(child.intensity);
							folder.add(child, 'intensity').min(0.01).max(f).step(0.001);
						}
						if (child.material) {
							if (child.material.color) {
								var conf = { color: child.material.color.getHex() };
								folder.addColor(conf, 'color').onChange(function (colorValue) {
									child.material.color.set(colorValue);
								});
							}
							if (child.material.specular) {
								var conf = { specular: child.material.specular.getHex() };
								folder.addColor(conf, 'specular').onChange(function (specularValue) {
									child.material.specular.set(specularValue);
								});
							}
							if (child.material.shininess) {
								var conf = { shininess: toN(child.material.shininess) };
								folder.add(conf, 'shininess').min(0).max(1000).step(0.1).onChange(function (shininessValue) {
									child.material.shininess = shininessValue;
								});
							}
						}
						if (child.color) {
							var conf = { color: child.color.getHex() };
							folder.addColor(conf, 'color').onChange(function (colorValue) {
								child.color.set(colorValue);///RGB(colorValue.r / 256, colorValue.g / 256, colorValue.b/256);
							});
						}
						folder.open();
						if (child.fixarr) {
							var s = child.fixarr.join(' ');
							var conf = { fixed: s };
							folder.add(conf, 'fixed');
						}
					}
				});

			}

		}

		function handleLine(ele, parent) {
			var att = getAttributes(ele);
			var material = assureLineMaterioal(ele);
			var geometry = assureLineGometry(ele);
			var obj = new THREE.Line(geometry, material)
			setCommonAttributes(obj, att);
			checkevents(ele, obj);
			parent.add(obj);
		}
		function assureLineGometry(ele) {
			var geometry = new THREE.Geometry();
			for (var n = 0; n < ele.children.length; n++) {
				var child = ele.children[n];
				var name = child.localName;
				switch (name) {
					case 'geometry':
						return handleGeometry(child, geometry);
				}
			}
			geometry.vertices.push(
				new THREE.Vector3(0, 0, 0),
				new THREE.Vector3(0, 0, -1));
			return geometry;
		}
		function handleGeometry(ele, geometry) {
			for (var n = 0; n < ele.children.length; n++) {
				var child = ele.children[n];
				var name = child.localName;
				switch (name) {
					case 'vector':
						var v = handleVector(child);
						if (v) {
							geometry.vertices.push(v);
						}
				}
			}
			return geometry;
		}
		function handleVector(obj) {
			var att = getAttributes(obj);
			if (att.val) {
				return toV(att.val);
			}
		}
		function assureLineMaterioal(ele) {
			for (var n = 0; n < ele.children.length; n++) {
				var child = ele.children[n];
				var name = child.localName;
				switch (name) {
					case 'linebasicmaterial':
						return handleBasciLineMaterial(child);
				}
			}
			return new THREE.LineBasicMaterial();
		}
		function handleBasciLineMaterial(ele) {
			var att = getAttributes(ele);
			var width = att.linewidth ? toN(att.linewidth) : 1;
			var opacity = att.opacity ? toN(att.opacity) : 1;
			var color = toColor(att.color);
			var parameters = {
				color: color,
				opacity: opacity,
				linewidth: width
			};
			return new THREE.LineBasicMaterial(parameters);
		}
		function handleGroup(ele, parent) {
			var att = getAttributes(ele);
			var obj = new THREE.Group();
			setCommonAttributes(obj, att);
			checkevents(ele, obj);
			checkObjectUpdateArray(obj);
			if (att.url) {
				obj.loaded = false;
				obj.url = att.url;
				if (!obj.name || obj.name.length == 0) {
					obj.name = getRandowmName();
					ele.setAttribute("name", obj.name);
				}
				var f = function () {
					if (!obj.loaded) {
						self.loadInGroup(obj.name, obj.url);
						obj.loaded = true;
					}
				}


				obj.updateArray.push(f);
			}
			parent.add(obj);
			return obj;
		}
		function handleGltfLoader(ele, parent) {
			var att = getAttributes(ele);
			if (att.name) {
				var tobj = scene.getObjectByName(att.name);
				if (tobj) {
					//var obj = tobj.clone();
					//setCommonAttributes(obj, att);
					//var hasMouseEvent = checkevents(ele, obj);
					////if (hasMouseEvent) {
					//setEventParent(obj, obj);
					////}
					////hideWaitModel(parent);
					//parent.add(obj);
					return tobj;
				}
			}
			if (att.url) {
				var p = "0";
				if (att.position) {
					p = att.position;
				}
				p = toV(p)
				showWaitModel(parent, p);
				const gltfLoader = new GLTFLoader();
				gltfLoader.load(att.url, (gltf) => {
					const root = gltf.scene;
					checkRepeat(ele, root, parent);

					//addModelInScene(root, att, ele, parent)
				});
			}
		}

		function setEventParent(parent, ele) {
			for (var n = 0; n < ele.children.length; n++) {
				var ch = ele.children[n];
				setEventParent(parent, ch);
				if (ch.type == "Mesh") {
					ch.eventParent = parent;
					//var wp = new THREE.Vector3();
					//ch.getWorldPosition(wp);
					//console.log(wp.x + ';' + wp.y + ';' + wp.z);
				}
			}
		}
		function meshFromBoundingBox(bbox) {
			var h = bbox.max.y - bbox.min.y;
			var w = bbox.max.x - bbox.min.x;
			var d = bbox.max.z - bbox.min.z;
			var b = new THREE.BoxGeometry(w, h, d);
			var c = new THREE.Color();
			var material = new THREE.MeshPhongMaterial({
				color: c,
				opacity: 0.5,
				transparent: true,
			});

			var obj = new THREE.Mesh(b, material);
			obj.visible = false;
			return obj;
		}
		function handleSkyBox(ele) {
			{
				var att = getAttributes(ele);
				const loader = new THREE.TextureLoader();
				if (att.url) {
					const texture = loader.load(
						att.url,
						() => {
							const rt = new THREE.WebGLCubeRenderTarget(texture.image.height);
							rt.fromEquirectangularTexture(renderer, texture);
							scene.background = rt;
						});
				}
				else {
					scene.background = '';
				}
			}
		}

		function getBarImage(imageType) {
			const img = document.createElement('img');
			img.src = imageType;
			img.style.width = '40px';
			img.style.height = '40px';
			img.style.margin = '5px';
			return img;
		}
		function getImageBarButton(name, title, imageType, bgc) {
			const div_h = document.createElement('div');
			div_h.style.width = '50px';
			div_h.style.height = '50px';
			div_h.title = title;
			if (bgc) {
				div_h.style.backgroundColor = bgc;
			}
			div_h.style.cursor = 'pointer';
			div_h.style.marginRight = '5px';
			//div_h.style.border = 'solid';
			div_h.name = name;
			div_h.className = name;
			const img = getBarImage(imageType);
			div_h.appendChild(img);
			return div_h;
		}
		function handleHtmlPlaneGeometry(ele, parent) {
			var bgc = undefined;
			var att = getAttributes(ele);
			if (att.name) {
				var tobj = scene.getObjectByName(att.name);
				if (tobj) {
					console.log('Duplicate attempt to initiate ' + att.name + '.');
					return tobj;
				}
			}
			var holder = new THREE.Group();
			parent.add(holder);
			if (ele.innerHTML) {
				att.html = ele.innerHTML.replace('<!--', '').replace('-->', '');
			}
			const div = document.createElement('div');
			var dw = 1920;
			var dh = 1080;
			var w = dw;
			var h = dh;
			var wf = 1;
			var hf = 1;
			var panelBarHeight = 50;
			var panelbar = true;
			if (att.panelbar) {
				panelbar = toB(att.panelbar);
			}

			if (att.width) {
				w = att.width;
				wf = Number(w) / dw;
			}
			if (att.height) {
				h = att.height;
				var corr = panelbar ? 0 : panelBarHeight;
				hf = (Number(h) - corr) / dh;
			}

			div.style.width = w + 'px';
			div.style.height = h + 'px';


			div.style.backgroundColor = '#000';

			div.className = 'tml_panel';

			const div_bar = document.createElement('div');
			div_bar.style.width = '100%';
			div_bar.style.height = panelBarHeight + 'px';
			div_bar.className = 'tml_bar';
			if (!(att.custombarcolor && toB(att.custombarcolor))) {
				//div_bar.style.backgroundColor = bgc;
			}

			if (!panelbar) {
				div_bar.style.display = 'none';
			}



			const div_left_menu = document.createElement('div');
			div_left_menu.style.width = '170px';
			div_left_menu.style.display = 'inline-block';
			//home button:
			const div_hb = getImageBarButton('home', 'Home', Images.Home, bgc);

			div_hb.style.float = 'left';
			if (att.homebutton) {
				if (!toB(att.homebutton)) {
					div_hb.style.display = 'none';
				}
			}

			div_left_menu.appendChild(div_hb);
			//left button:
			const div_lb = getImageBarButton('left', 'Previous', Images.ArrowLeft, bgc);
			div_lb.style.display = 'none'
			div_lb.style.float = 'left';
			div_left_menu.appendChild(div_lb);
			//right button:
			const div_rb = getImageBarButton('right', 'Next', Images.ArrowRight, bgc);
			div_rb.style.display = 'none'
			div_rb.style.float = 'right';
			div_left_menu.appendChild(div_rb);

			div_bar.appendChild(div_left_menu);
			//present button:
			const div_h = getImageBarButton('handle', 'Present', Images.MagnifyImage, bgc);
			div_h.style.display = 'none'
			div_h.style.float = 'right';

			div_bar.appendChild(div_h);
			div.appendChild(div_bar);

			const iframe = document.createElement('iframe');
			iframe.style.width = w + 'px';
			iframe.style.height = h + 'px';
			iframe.style.border = '0px';
			iframe.name = att.name;
			iframe.allow = 'autoplay'
			if (att.scrolling) {
				var scr = toB(att.scrolling);
				if (!scr) {
					iframe.scrolling = 'no';
				}
			}
			if (att.zoom) {
				iframe.style.zoom = att.zoom;
			}

			if (att.url) {
				iframe.src = att.url;
				div.appendChild(iframe);
			}
			else if (att.html) {
				//div.style.backgroundColor = '#FFF';
				//iframe.srcdoc = att.html;
				const d = document.createElement('div');
				d.innerHTML = att.html;
				div.appendChild(d);
			}
			const obj = new CSS3DObject(div);

			holder.add(obj);

			//add transparantplane
			var geometry = new THREE.PlaneGeometry(1.53 * wf, 0.92 * hf);
			var material = new THREE.MeshBasicMaterial();
			material.color.set('black'); //red
			material.opacity = 0;
			material.blending = THREE.NoBlending;
			material.side = THREE.DoubleSide;
			var p = new THREE.Mesh(geometry, material);
			var pcorr = panelbar ? -0.027 : 0;
			p.position.set(0, pcorr, 0);

			holder.add(p);
			p.eventParent = holder;

			setCommonAttributes(holder, att);
			var v = obj.scale;
			obj.scale.set(0.0008 * v.x, 0.0008 * v.y, 0.0008 * v.z);
			checkevents(ele, holder);
			//iframe history
			//iframe.onload = checkIrameHistory(obj, iframe, div_lb, div_rb);
			iframe.addEventListener("load", function () { checkIrameHistory(obj, iframe, div_lb, div_rb); });
			div_hb.addEventListener("click", function () { goHome(iframe); });
			div_lb.addEventListener("click", function () { goPrev(obj, iframe); });
			div_rb.addEventListener("click", function () { goNext(obj, iframe); });
			//div_lb.onclick = goPrev(obj, iframe);
			//div_rb.onclick = goNext(obj, iframe);
			holder.threemlType = 'HtmlPlaneGeometry';
			return obj;

		};
		function goHome(ifr) {
			ifr.src = ifr.src;
		}
		function goPrev(obj, ifr) {
			//ifr.src = ifr.src;
			if (obj.history && obj.historyIdx > 1) {
				obj.historyIdx--;
				ifr.src = obj.history[obj.historyIdx];
			}
		}
		function goNext(obj, ifr) {
			if (obj.history && obj.historyIdx < obj.history.length) {
				obj.historyIdx++;
				ifr.src = obj.history[obj.historyIdx];
			}
		}
		function checkIrameHistory(obj, ifr, lburron, rbutton) {
			if (!ifr || !ifr.contentWindow || !ifr.contentWindow.location) {
				return;
			}
			try {
				var a = ifr.contentWindow.location.href;
			}
			catch (x) {
				return;
			}
			if (!obj.history) {
				obj.history = [];
				obj.historyIdx = -1;
			}
			var loc = ifr.contentWindow.location;
			if (obj.history.length == obj.historyIdx) {
				obj.history.push(loc);
				obj.historyIdx = obj.history.length;
			}
			if (obj.historyIdx > 0) {
				lburron.style.display = 'inline-block';
			}
			else {
				lburron.style.display = 'none';
			}
			if (obj.historyIdx < obj.history.length - 1) {
				rbutton.style.display = 'inline-block';
			}
			else {
				rbutton.style.display = 'none';
			}
		}
		function handleCamera(ele, parent) {
			var att = getAttributes(ele);
			if (att.mode) {
				switch (att.mode) {
					case "lookat":
						navigating = CameraMode.LOOKAT;
						break;
					case "scan":
						navigating = CameraMode.SCAN;
						break;
					case "click":
						navigating = CameraMode.CLICK;
						break;
					case "drag":
						navigating = CameraMode.DRAG;
						break;
					default:
						navigating = CameraMode.FIXED;
						camera.lookAt(new THREE.Vector3(0, 0, -100));
						break;
				}
			}
			else {
				navigating = CameraMode.FIXED;
				camera.lookAt(new THREE.Vector3(0, 0, -100));
			}
			if (att.position) {
				var v = toV(att.position)
				camera.position.set(v.x, v.y, v.z);
			}
			if (att.rotation) {
				var v = toV(att.rotation)
				camera.rotation.set(v.x, v.y, v.z);
			}
			cameraMaxXangle = att.maxxangle ? toR(att.maxxangle) : cameraMaxXangleDef;
			cameraMaxYangle = att.maxyangle ? toR(att.maxyangle) : cameraMaxYangleDef;
		}
		function handleCanvas(ele) {
			var att = getAttributes(ele);
			if (att.zindex) {
				var canvas = document.getElementsByTagName('canvas');
				canvaszindex = toN(att.zindex);
				for (var n = 0; n < canvas.length; n++) {
					canvas[n].style.zIndex = canvaszindex;
				}
			}

		}
		function handleRenderer(ele) {
			var att = getAttributes(ele);
			if (att.clearcolor) {
				var c = toColor(att.clearcolor); // create once and reuse
				renderer.setClearColor(c);//0xb0f442);
			}
		}
		function handleScene(ele) {
			var att = getAttributes(ele);
			if (att.background) {
				var c = toColor(att.background);
				scene.background = c;
			}
		}

		function handlePlaneGeometry(ele, parent) {
			var att = getAttributes(ele);
			var geometry = new THREE.PlaneBufferGeometry(1, 1);
			var material = assureGeometryMat(ele);
			var obj = new THREE.Mesh(geometry, material);

			setCommonAttributes(obj, att);
			checkevents(ele, obj);
			parent.add(obj);
			return obj;

		}
		function handleParametricBufferGeometry(ele, parent) {
			var att = getAttributes(ele);
			var width = att.width ? toN(att.width) : 10;
			var height = att.height ? toN(att.height) : 10;
			var xSegs = att.xsegs ? toN(att.xsegs) : 10;
			var ySegs = att.ysegs ? toN(att.ysegs) : 10;
			const planeFunction = plane(xSegs, ySegs);
			function plane(width, height) {
				return function (u, v, target) {
					const x = (u - 0.5) * width;
					const y = (v + 0.5) * height;
					const z = 0;
					target.set(x, y, z);
				};
			}

			var geometry = new THREE.ParametricBufferGeometry(planeFunction, width, height);
			var material = assureGeometryMat(ele);
			var obj = new THREE.Mesh(geometry, material);
			setCommonAttributes(obj, att);
			checkevents(ele, obj);
			parent.add(obj);
			return obj;


		}




		function handleBoxGeometry(ele, parent) {
			var att = getAttributes(ele);
			var geometry = new THREE.BoxBufferGeometry();

			var material = assureGeometryMat(ele);
			var obj = new THREE.Mesh(geometry, material);

			setCommonAttributes(obj, att);
			checkevents(ele, obj);
			parent.add(obj);
			return obj;

		}
		function handleReflector(ele, parent) {
			var att = getAttributes(ele);
			var type = att.type ? att.type : 'circle';
			var geometry;
			switch (type) {
				case 'box':
					geometry = new THREE.BoxBufferGeometry();
					break;
				case 'sphere':
					geometry = new THREE.SphereBufferGeometry(1, 80, 80);
					break;
				case 'plane':
					geometry = new THREE.PlaneBufferGeometry();
					break;
				default:
					geometry = new THREE.CircleBufferGeometry(1, 32);
					break;
			}
			var obj = new Reflector(geometry, {
				clipBias: 0.003,
				textureWidth: window.innerWidth * window.devicePixelRatio,
				textureHeight: window.innerHeight * window.devicePixelRatio,
				color: 0x777777,
				recursion: 1
			});
			setCommonAttributes(obj, att);
			checkevents(ele, obj);
			parent.add(obj)


		}
		function handleSphereGeometry(ele, parent) {
			var att = getAttributes(ele);
			//radius : Float, widthSegments : Integer, heightSegments : Integer, phiStart : Float, phiLength : Float, thetaStart : Float, thetaLength : Float
			var radius = att.radius ? toN(att.radius) : 1;
			var widthSegments = att.widthsegments ? toN(att.widthsegments) : 30;
			var heightSegments = att.heightsegments ? toN(att.heightsegments) : 30;
			var phiStart = att.phistart ? toN(att.phistart) : 0;
			var phiLength = att.philength ? toN(att.philength) : 2 * Math.PI;
			var thetaStart = att.thetastart ? toN(att.thetastart) : 0;
			var thetaLength = att.thetalength ? toN(att.thetalength) : Math.PI;

			var geometry = new THREE.SphereBufferGeometry(radius, widthSegments, heightSegments, phiStart, phiLength, thetaStart, thetaLength);
			var material = assureGeometryMat(ele);
			var obj = new THREE.Mesh(geometry, material);
			geometry.computeVertexNormals();
			setCommonAttributes(obj, att);
			checkevents(ele, obj);
			parent.add(obj);
			return obj;

		}
		function handleCircleGeometry(ele, parent) {
			var att = getAttributes(ele);
			var geometry = new THREE.CircleBufferGeometry();
			var material = new THREE.MeshBasicMaterial({ color: 0xffff00 });// assureGeometryMat(ele);
			var obj = new THREE.Mesh(geometry, material);
			checkevents(ele, obj);
			setCommonAttributes(obj, att);
			parent.add(obj);
			return obj;

		}
		function handleConeGeometry(ele, parent) {
			var att = getAttributes(ele);
			var radius = att.radius ? toN(att.radius) : 1;
			var height = att.height ? toN(att.height) : 1;
			var radialSegments = att.radialsegments ? toN(att.radialsegments) : 8;
			var geometry = new THREE.ConeBufferGeometry(radius, height, radialSegments);
			var material = assureGeometryMat(ele);
			var obj = new THREE.Mesh(geometry, material);
			checkevents(ele, obj);
			setCommonAttributes(obj, att);
			parent.add(obj);
			return obj;
		}
		function handleTorusGeometry(ele, parent) {
			var att = getAttributes(ele);
			//radius : Float, tube : Float, radialSegments : Integer, tubularSegments : Integer, arc : Float
			var radius = att.radius ? toN(att.radius) : 1;
			var tube = att.tube ? toN(att.tube) : 0.4;
			var radialSegments = att.radialsegments ? toN(att.radialsegments) : 8;
			var tubularSegments = att.tubularsegments ? toN(att.tubularsegments) : 6;
			var arc = att.arc ? toN(att.arc) : 2 * Math.PI;
			var geometry = new THREE.TorusBufferGeometry(radius, tube, radialSegments, tubularSegments, arc);
			var material = assureGeometryMat(ele);
			var obj = new THREE.Mesh(geometry, material);
			checkevents(ele, obj);
			setCommonAttributes(obj, att);
			parent.add(obj);
			return obj;
		}
		function handleFlyControls(ele) {
			var att = getAttributes(ele);
			navigating = CameraMode.FIXED;
			controls = new FlyControls(camera, container);

			controls.movementSpeed = 3000;
			//controls.domElement = renderer.domElement;
			controls.rollSpeed = Math.PI / 24;
			controls.autoForward = false;
			controls.dragToLook = true;
		}
		function handleCursor3d(ele) {

			var att = getAttributes(ele);
			if (att.clear && toB(att.clear)) {
				cursor3d = undefined;
			}
			else {
				addCursor3d(ele);
			}
		}
		function addCursor3d(ele) {
			var geometry = new THREE.SphereBufferGeometry(0.1);
			var material = ele ? assureGeometryMat(ele) : new THREE.MeshPhongMaterial();
			cursor3d = new THREE.Mesh(geometry, material);
			material.color.setRGB(1, 0, 0);
			cursor3d.position.z = -4;

			if (ele) {
				var att = getAttributes(ele);
				setCommonAttributes(cursor3d, att);
			}

			geometry.computeVertexNormals();
			cursor3d.draggable = true;
			cursor3d.visible = false;
			scene.add(cursor3d);
		}
		function handleCylinderGeometry(ele, parent) {
			var att = getAttributes(ele);
			//radiusTop : Float, radiusBottom : Float, height : Float, radialSegments : Integer, heightSegments : Integer, openEnded : Boolean, thetaStart : Float, thetaLength : Float
			var radiusTop = att.radiustop ? toN(att.radiustop) : 1;
			var radiusBottom = att.radiusbottom ? toN(att.radiusbottom) : 1;
			var height = att.height ? toN(att.height) : 1;
			var radialSegments = att.radialsegments ? toN(att.radialsegments) : 8;
			var heightSegments = att.heightsegments ? toN(att.heightsegments) : 1;
			var openEnded = att.openended ? toB(att.openended) : false;
			var thetaStart = att.thetastart ? toN(att.thetastart) : 0;
			var thetaLength = att.thetalength ? toN(att.thetalength) : 2 * Math.PI;



			var geometry = new THREE.CylinderBufferGeometry(radiusTop, radiusBottom, height, radialSegments, heightSegments, openEnded, thetaStart, thetaLength);
			var material = assureGeometryMat(ele);
			var obj = new THREE.Mesh(geometry, material);
			checkevents(ele, obj);
			setCommonAttributes(obj, att);
			parent.add(obj);
			return obj;
		}

		function handleDirectionalLight(ele, parent) {
			var att = getAttributes(ele);
			if (att.name) {
				var tobj = scene.getObjectByName(att.name);
				if (tobj) {
					return tobj;
				}
			}
			var light = new THREE.DirectionalLight();
			setCommonAttributes(light, att);
			if (att.target) {
				var obj = scene.getObjectByName(att.target);
				if (obj) {
					light.target = obj;
				}
			}
			checkevents(ele, light);
			parent.add(light);
			//var helper = new THREE.DirectionalLightHelper(light);
			//helper.position.set(0, 0, -2);
			//parent.add(helper);
			return light;

		}

		function handleHemisphereLight(ele, parent) {
			var att = getAttributes(ele);
			if (att.name) {
				var tobj = scene.getObjectByName(att.name);
				if (tobj) {
					return tobj;
				}
			}
			var light = new THREE.HemisphereLight();
			setCommonAttributes(light, att);
			if (att.skycolor) {
				light.skyColor = toColor(att.skycolor)
			}
			if (att.groundcolor) {
				light.groundColor = toColor(att.groundcolor)
			}
			checkevents(ele, light);
			parent.add(light);
			return light;

		}
		function handlePointLight(ele, parent) {
			var att = getAttributes(ele);
			//if (att.name) {
			//	var tobj = scene.getObjectByName(att.name);
			//	if (tobj) {
			//		return tobj;
			//	}
			//}
			var light = new THREE.PointLight();
			setCommonAttributes(light, att);
			checkevents(ele, light);
			parent.add(light);
			return light;

		}
		function handleAmbientLight(ele, parent) {
			var att = getAttributes(ele);
			if (att.name) {
				var tobj = scene.getObjectByName(att.name);
				if (tobj) {
					return tobj;
				}
			}
			var light = new THREE.AmbientLight();
			setCommonAttributes(light, att);
			checkevents(ele, light);
			parent.add(light);
			return light;

		}

		function handleTextGeometry(ele, parent) {
			var att = getAttributes(ele);
			if (att.name) {
				var tobj = scene.getObjectByName(att.name);
				if (tobj) {
					return tobj;
				}
			}
			var fontFile = '';
			if (att.fontfile) {
				fontFile = att.fontFile.toLowerCase();
			}

			if (fontFile.length > 0) {
				const loader = new THREE.FontLoader();
				loader.load(fontFile, function (font) {
					return createFontObj(ele, parent, font, att);
				});
			}
			else {
				var font = new THREE.Font(defaultFont.data);
				return createFontObj(ele, parent, font, att);
			}



		}
		function createFontObj(ele, parent, font, att) {
			var material = assureGeometryMat(ele);
			var text = '[no text specfied]';
			if (att.text) {
				text = att.text;
			}
			var size = att.size ? toN(att.size) * 60 : 60;
			var height = att.height ? toN(att.height) * 20 : 20;
			var curveSegments = att.curvesegments ? toN(att.curvesegments) : 3;
			var bevelThickness = att.bevelthickness ? toN(att.bevelthickness) : 1;
			var bevelSize = att.bevelsize ? toN(att.bevelsize) : 1;
			var bevelEnabled = att.bevelenabled ? toB(att.bevelenabled) : true;
			var textGeo = new THREE.TextGeometry(text, {

				font: font,

				size: size,
				height: height,
				curveSegments: curveSegments,

				bevelThickness: bevelThickness,
				bevelSize: bevelSize,
				bevelEnabled: bevelEnabled

			}
			);

			textGeo.computeBoundingBox();
			textGeo.computeVertexNormals();

			const triangle = new THREE.Triangle();

			// "fix" side normals by removing z-component of normals for side faces
			// (this doesn't work well for beveled geometry as then we lose nice curvature around z-axis)

			if (!bevelEnabled) {

				const triangleAreaHeuristics = 0.1 * (height * size);

				for (let i = 0; i < textGeo.faces.length; i++) {

					const face = textGeo.faces[i];

					if (face.materialIndex == 1) {

						for (let j = 0; j < face.vertexNormals.length; j++) {

							face.vertexNormals[j].z = 0;
							face.vertexNormals[j].normalize();

						}

						const va = textGeo.vertices[face.a];
						const vb = textGeo.vertices[face.b];
						const vc = textGeo.vertices[face.c];

						const s = triangle.set(va, vb, vc).getArea();

						if (s > triangleAreaHeuristics) {

							for (let j = 0; j < face.vertexNormals.length; j++) {

								face.vertexNormals[j].copy(face.normal);

							}

						}

					}

				}

			}

			const centerOffset = - 0.5 * (textGeo.boundingBox.max.x - textGeo.boundingBox.min.x);

			textGeo = new THREE.BufferGeometry().fromGeometry(textGeo);

			var obj = new THREE.Mesh(textGeo, material);




			setCommonAttributes(obj, att);
			obj.scale.multiplyScalar(0.001);
			obj.position.x += centerOffset * obj.scale.x;
			checkevents(ele, obj);
			parent.add(obj);
			return obj;
		}

		function handleSpotLight(ele, parent) {
			var att = getAttributes(ele);
			if (att.name) {
				var tobj = scene.getObjectByName(att.name);
				if (tobj) {
					return tobj;
				}
			}
			var obj = new THREE.SpotLight();
			obj.distance = 200;
			checkevents(ele, obj);
			setCommonAttributes(obj, att);
			if (att.target) {
				var objt = scene.getObjectByName(att.target);
				if (objt) {
					obj.target = objt;
				}
			}
			if (att.color) {
				obj.color = toColor(att.color);
			}

			obj.penumbra = att.penumbra ? toR(att.penumbra) : 0;
			obj.angle = att.angle ? toR(att.angle) : Math.PI / 3;
			obj.decay = att.decay ? toN(att.decay) : 1;
			obj.distance = att.distance ? toN(att.distance) : 0;
			parent.add(obj);
			return obj;

		}

		function addModelInScene(obj, ele, parent) {
			var att = getAttributes(ele);
			setCommonAttributes(obj, att);
			obj.threemlType = 'gltfLoader';
			obj.url = att.url;
			checkevents(ele, obj);
			setEventParent(obj, obj);
			hideWaitModel(parent);
			parent.add(obj);
		}
		function checkevents(ele, obj) {
			var hasMouseEvent = false;
			for (var n = 0; n < ele.children.length; n++) {
				var child = ele.children[n];
				var name = child.localName;
				switch (name) {
					case 'rotate':
						handleRotate(obj, child);
						break;
					case 'pulse':
						handlePulse(obj, child);
						break;
					case 'blink':
						handleBlink(obj, child);
						break;
					case 'present':
						handlePresent(obj, child);
						hasMouseEvent = true;
						break;
					case 'link':
						handleLink(obj, child);
						hasMouseEvent = true;
						break;
					case 'lookat':
						handleLookAt(obj, child);
						break;
					case 'walk':
						handleWalk(obj, child);
						hasMouseEvent = true;
						break;
					case 'draggable':
						handleDraggable(obj, child);
						hasMouseEvent = true;
						break;
					case 'hover':
						handleHover(obj, child);
						//hasMouseEvent = true;
						break;
					case 'media':
						handleMedia(obj, child);
						hasMouseEvent = true;
						break;
					case 'actions':
						handleActions(obj, child);
						break;
					case 'softbody':
						handleSoftBodies(obj, child);
						break;
				}
			}
			return hasMouseEvent;
		}
		//function checkObjectUpdateArray(obj) {
		//	if (!obj.updateArray) {
		//		obj.updateArray = [];
		//		obj.update = function () {
		//			for (var n = 0; n < obj.updateArray.length; n++) {
		//				obj.updateArray[n].call(obj);
		//                  }
		//              }
		//          }
		//}//////////////////////////////////////////////////////////////////////


		//////////////////////////////////////////////////////////////////////////////////////////////////
		//var particles = [];
		function shuffleArray(arr) {
			for (let i = arr.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[arr[i], arr[j]] = [arr[j], arr[i]];
			}
			console.log(arr);
		}
		////////////////////////////////////// Windarray
		function CreateWind3DArray(v) {
			var a = [];
			for (var n = 0; n < 5; n++) {
				var l = CreateWind2DArray(v);
				a.push(l);
			}
			return a;
		}
		function getR(scale = 1) {
			return Math.random() * 2 * scale - scale;
		}
		function CreateWind2DArray(v) {
			var a = [];
			for (var n = 0; n < 5; n++) {
				var b = [];
				for (var m = 0; m < 5; m++) {
					b.push(v);
				}
				a.push(b);
			}
			return a;
		}
		function AddWindlayer(prev) {
			var arr = CreateWind2DArray(0);
			for (var n = 0; n < 5; n++) {
				for (var m = 0; m < 5; m++) {
					var i1 = n > 0 ? n - 1 : 4;
					var i2 = n < 4 ? n + 1 : 0;
					var i3 = m > 0 ? m - 1 : 4;
					var i4 = m < 4 ? m + 1 : 0;
					var f = getR(0.01);
					var itp = (prev[n][m] + (prev[i1][m] + prev[i2][m] + prev[n][i3] + prev[n][i4]) / 4) / 2 + f;
					itp = itp < -1 ? -1 : itp;
					itp = itp > 1 ? 1 : itp;
					arr[n][m] = itp;
				}
			}
			return arr;
		}
		function getWindArrayFactor(obj, pos) {
			if (obj.windArray) {
				var v = pos.clone().sub(obj.minVector);
				if (!(obj.scaleVector.x == 0 || obj.scaleVector.y == 0 || obj.scaleVector.z == 0)) {
					v.x /= obj.scaleVector.x;
					v.y /= obj.scaleVector.y;
					v.z /= obj.scaleVector.z;
				}
				v.normalize().multiplyScalar(4.9);
				var x = Math.floor(Math.abs(v.x));
				var y = Math.floor(Math.abs(v.y));
				var z = Math.floor(Math.abs(v.z));
				return obj.windArray[x][y][z];
			}
			return 1;
		}
		function randomUpdateWindArray(arr) {
			if (Math.random() < 0.03) {
				updateWindlayer(arr);
			}
		}
		function updateWindlayer(arr) {
			arr.splice(0, 1);
			var nl = AddWindlayer(arr[3]);
			arr.push(nl);
		}
		function addLabel(txt) {
			var holder = new THREE.Group();
			const d = document.createElement('div');
			d.innerHtml = txt;
			d.style.backgroundColor = 'white';
			d.style.width = '40px';
			d.style.height = '20px';
			d.style.display = 'block';
			d.style.color = 'black';
			d.style.fontSize = '20px'
			//d.style.padding = '5px';
			var obj = new CSS3DObject(d);
			scene.add(obj)
			var r = toRotV('0 180 0');
			obj.rotation.set(r.x, r.y, r.z);

			holder.add(obj);

			//add transparantplane
			var geometry = new THREE.PlaneGeometry(0.07, 0.03);
			var material = new THREE.MeshBasicMaterial();
			material.color.set('black'); //red
			material.opacity = 0;
			material.blending = THREE.NoBlending;
			material.side = THREE.DoubleSide;
			var p = new THREE.Mesh(geometry, material);

			holder.add(p);
			scene.add(holder);



			return holder
		}
		//function checkBoundingVectors(obj, pos) {
		//	obj.minVector.x = obj.minVector.x < pos.x ? obj.minVector.x : pos.x;
		//	obj.minVector.y = obj.minVector.y < pos.y ? obj.minVector.y : pos.y;
		//	obj.minVector.z = obj.minVector.z < pos.x ? obj.minVector.z : pos.z;
		//	obj.maxVector.x = (obj.maxVector.x > pos.x ? obj.maxVector.x : pos.x) - obj.minVector.x;
		//	obj.maxVector.y = (obj.maxVector.y > pos.y ? obj.maxVector.y : pos.y) - obj.minVector.y;
		//	obj.maxVector.z = (obj.maxVector.z > pos.x ? obj.maxVector.z : pos.z) - obj.minVector.z;

		//}
		//////////////////////////////////////////////////////////////////////
		function simulateSoftBody(obj) {
			if (obj.particles) {
				var now = Date.now();
				var gravity;
				var windForce;
				var dragging;
				var newdragPoint;
				obj.fixarr = [];
				//shuffleArray(obj.particleIdx);
				for (var n = 0; n < obj.particleIdx.length; n++) {
					//handle constraints
					var p = obj.particles[obj.particleIdx[n]];
					if (!p.fixed) {
						var idx = p.index[0];
						var pos = getPosition(obj, idx);
						var orig = pos.clone();
						for (var x = 0; x < obj.constraints.length; x++) {
							var c = obj.constraints[x];
							switch (c.type) {
								case SoftBodyConstraint.GRAVITY:
									if (!gravity) {
										var factor = c.factor ? c.factor : 1;
										gravity = obj.worldToLocal((new THREE.Vector3(0, -9.8, 0))).multiplyScalar(0.001 * factor);
									}
									pos.add(gravity);
									break;
								case SoftBodyConstraint.NORMAL:
									var normal = getNormal(obj, idx);
									var factor = c.factor ? c.factor : 1;
									pos.add(normal.multiplyScalar(0.03 * factor));
									break;
								case SoftBodyConstraint.WIND:
									if (!windForce) {
										if (!obj.windArray) {
											obj.windArray = CreateWind3DArray(0);
											var bbox = new THREE.Box3().setFromObject(obj);

											obj.minVector = bbox.min;
											obj.scaleVector = bbox.max;
											obj.scaleVector.sub(bbox.min);
										}
										var factor = c.factor ? c.factor : 1;
										var scale = c.scale ? c.scale : 1;
										if (!obj.offset) {
											obj.offset = Math.random();
										}
										var period = 1000 * scale;
										if (period == 0) {
											period = 100;
										}
										var cnow = now + obj.offset * period * 7;
										const windStrength = Math.cos(cnow / (period * 7)) * 20 + 40;
										windForce = new THREE.Vector3(Math.sin(cnow / (period * 2)), Math.cos(cnow / (period * 3)), Math.sin(cnow / period));
										windForce.normalize();
										windForce.multiplyScalar(windStrength * factor * 0.001);

									}
									//checkBoundingVectors(obj, pos);
									var f = c.useArray ? getWindArrayFactor(obj, pos) : 1;
									var wf = windForce.clone();
									pos.add(wf.multiplyScalar(f));
									break;
								case SoftBodyConstraint.STRETCH:
									//distance
									var factor = c.factor ? c.factor : 1;
									for (var m = 0; m < p.children.length; m++) {
										var cidc = p.children[m];
										var cpos = getPosition(obj, cidc);
										var v = cpos.sub(pos).clone();
										var d = v.length();
										v.normalize();
										var prev_d = p.dist[m];
										var fact = prev_d - d;
										var si = Math.sign(fact);
										v.multiplyScalar(-si * (fact * fact) * factor * 0.1);
										if (v.length() > 1) {
											v.normalize().multiplyScalar(1);
										}
										pos.add(v);
									}
									break;
								case SoftBodyConstraint.STRUCTURE:
									//distance
									var factor = c.factor ? c.factor : 1;
									var cpos = p.startposition;
									pos.lerp(cpos, factor * 0.01)
									break;
								case SoftBodyConstraint.FLOOR:
									//floor
									var factor = c.factor ? c.factor : -1.5;
									if (pos.y < factor) {
										pos.x = orig.x;
										pos.y = factor;
										pos.z = orig.z;
									}
									break;
								case SoftBodyConstraint.DRAG:
									if (true) {//selectedObject && selectedObject.id == obj.id ) {
										if (!dragging) {
											if (cursor3d && cursor3d.visible) {//mouseDivX != 0 || mouseDivY != 0) {
												dragging = true;
												newdragPoint = obj.worldToLocal(cursor3d.position.clone());
											}
										}
										if (dragging) {
											var dist = newdragPoint.distanceTo(pos);
											var scale = c.scale ? c.scale : 1;
											if (fixHandle == FixHandle.TOGGLE && dist < obj.scale.x * scale) {// cursor3d.scale.x * 
												p.fixed = !p.fixed;
											}
											else {
												var tdist = dist < 0.4 ? 0.4 : dist;
												var factor = c.factor ? c.factor : 1;
												var v = 1 / Math.pow(tdist, 3)
												//if (v < 1) { v = 1;}
												pos.lerp(newdragPoint, 0.02 * factor * (v));
											}

										}
									}
									break;
								case SoftBodyConstraint.GRAB:
									if (obj.grabMode) {
										if (cursor3d && cursor3d.visible) {
											if (!newdragPoint) {
												newdragPoint = obj.worldToLocal(cursor3d.position.clone());
											}
											switch (obj.grabMode) {
												case GrabMode.NONE:
													obj.grabMode = GrabMode.INIT;

													break;
												case GrabMode.INIT:
													var dist = newdragPoint.distanceTo(pos);
													var factor = c.factor ? c.factor : 1;
													if (dist < factor) {
														p.grabVector = pos.clone().sub(newdragPoint);
													}
													break;
												case GrabMode.DRAG:
													if (p.grabVector) {
														if (fixHandle == FixHandle.TOGGLE) {
															p.fixed = !p.fixed;
														}
														pos = newdragPoint.add(p.grabVector);
													}
											}
										}
										else {
											obj.grabMode = GrabMode.NONE;
											p.grabVector = undefined;
										}

									}


									break;
							}

						}
						if (isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.z) || orig.distanceTo(pos) > 10) {
							pos = orig;

						}
						for (var m = 0; m < p.index.length; m++) {
							var i = p.index[m];
							obj.geometry.attributes.position.setXYZ(i, pos.x, pos.y, pos.z);
						}
						//if (!p.label) {
						//	p.label = addLabel(p.index[0]);
						//}
						//var labelpos = obj.localToWorld(pos);
						//p.label.position.set(labelpos.x, labelpos.y, labelpos.z);
					}
					else {
						obj.fixarr.push(p.index[0]);
					}
				}
				if (obj.grabMode && obj.grabMode == GrabMode.INIT) {
					obj.grabMode = GrabMode.DRAG;
				}
				//console.log(fixarr.join(' '));
				obj.geometry.attributes.position.needsUpdate = true;
				obj.geometry.computeVertexNormals();
				if (obj.windArray) {
					randomUpdateWindArray(obj.windArray);
				}
			}
		}

		function checkRepeat(ele, obj, parent) {
			for (var n = 0; n < ele.children.length; n++) {
				var child = ele.children[n];
				var name = child.localName;
				switch (name) {
					case 'repeat':
						return handleRepeat(obj, child, ele, parent);
						break;
				}
			}
			addModelInScene(obj, ele, parent);
		}

		function handleRepeat(obj, ele, parentele, parent) {
			var att = getAttributes(ele);

			var number = att.number ? toN(att.number) : 1;
			var maxpos = att.maxposition ? toV(att.maxposition) : new THREE.Vector3();
			var maxrot = att.maxrotation ? toV(att.maxrotation) : new THREE.Vector3();
			var minscale = att.minscale ? toV(att.minscale) : new THREE.Vector3(1, 1, 1);
			var maxscale = att.maxscale ? toV(att.maxscale) : new THREE.Vector3(1, 1, 1);

			for (var n = 0; n < number; n++) {
				var nobj = obj.clone();
				addModelInScene(nobj, parentele, parent);
				//position
				nobj.position.add(getRandomVector(maxpos));
				//rotation
				var nrot = getRandomVector(maxrot);
				nobj.rotation.x = toR(nrot.x);
				nobj.rotation.y = toR(nrot.y);
				nobj.rotation.z = toR(nrot.z);
				//scale
				nobj.scale.set(getRandowScaleP(minscale.x, maxscale.x), getRandowScaleP(minscale.y, maxscale.y), getRandowScaleP(minscale.z, maxscale.z));

			}
		}
		function getRandowScaleP(mins, maxs) {
			return mins + (maxs - mins) * Math.random();
		}
		function getRandomVector(maxv) {
			return new THREE.Vector3((0.5 - Math.random()) * maxv.x, (0.5 - Math.random()) * maxv.y, (0.5 - Math.random()) * maxv.z);
		}
		function handleSoftBodies(obj, ele) {
			if (obj.geometry) {
				handleSoftBody(obj, ele);
			}
			if (obj.children) {
				for (var n = 0; n < obj.children.length; n++) {
					handleSoftBodies(obj.children[n], ele);
				}
			}
		}
		function handleSoftBody(obj, ele) {
			//var att = getAttributes(ele);

			obj.particles = [];
			obj.constraints = [];

			//fill particles
			for (var n = 0; n < obj.geometry.index.count; n = n + 3) {
				var idx0 = obj.geometry.index.array[n];
				var idx1 = obj.geometry.index.array[n + 1];
				var idx2 = obj.geometry.index.array[n + 2];
				assureParticle(obj, idx0, idx1, idx2);
				assureParticle(obj, idx1, idx2, idx0);
				assureParticle(obj, idx2, idx0, idx1);
			}
			//set default distances and particleIdx
			obj.particleIdx = [];
			for (var n = 0; n < obj.particles.length; n++) {
				var p = obj.particles[n]
				var idx = p.index[0];
				var pos = getPosition(obj, idx);
				for (var m = 0; m < p.children.length; m++) {
					var cidc = p.children[m];
					var cpos = getPosition(obj, cidc);
					var d = cpos.distanceTo(pos);
					p.dist.push(d);
				}


				obj.particleIdx.push(n);
			}
			//check constraints
			for (var n = 0; n < ele.children.length; n++) {
				var child = ele.children[n];
				var name = child.localName;
				switch (name) {
					case 'constraint':
						handleConstraint(obj, child);
						break;
				}
			}
		}
		function handleConstraint(obj, ele) {
			var att = getAttributes(ele);
			var t = att.type;
			var factor = att.factor ? toN(att.factor) : undefined;
			var scale = att.scale ? toN(att.scale) : 1;
			var useArray = att.usearray ? toB(att.usearray) : false;
			var c = {
				factor: factor,
				scale: scale
			}
			switch (t) {
				case 'fixed':
					return handleFilex(obj, att);
					break;
				case 'gravity':
					c.type = SoftBodyConstraint.GRAVITY;
					//c.factor = factor;
					break;
				case 'normal':
					c.type = SoftBodyConstraint.NORMAL;
					break;
				case 'stretch':
					c.type = SoftBodyConstraint.STRETCH;
					break;
				case 'wind':
					c.type = SoftBodyConstraint.WIND;
					c.useArray = useArray;
					break;
				case 'floor':
					c.type = SoftBodyConstraint.FLOOR;
					break;
				case 'structure':
					c.type = SoftBodyConstraint.STRUCTURE;
					break;
				case 'drag':
					c.type = SoftBodyConstraint.DRAG;
					checkCursor3d();
					break;
				case 'grab':
					c.type = SoftBodyConstraint.GRAB;
					obj.grabMode = GrabMode.NONE;
					checkCursor3d();
					break;
			}
			obj.constraints.push(c);

		}

		function checkCursor3d() {
			if (!cursor3d) {
				addCursor3d();
			}
		}
		function handleFilex(obj, att) {
			var tfixedIdx = att.index ? att.index.split(' ') : [];
			var fixedIdx = [];
			for (var x = 0; x < tfixedIdx.length; x++) {
				fixedIdx.push(Number(tfixedIdx[x]));
			}
			var gpos = att.position ? toV(att.position) : undefined;
			for (var n = 0; n < obj.particles.length; n++) {
				var p = obj.particles[n];
				for (var o = 0; o < p.index.length; o++) {

					var fixed = isFixed(p.index[o], fixedIdx);
					if (fixed) {
						p.fixed = true;
						if (gpos) {
							obj.updateMatrixWorld();
							gpos.add(obj.position);
							var pos = obj.worldToLocal(gpos);
							p.startposition.set(pos.x, pos.y, pos.z);
							for (var r = 0; r < p.index.length; r++) {
								var i = p.index[r];
								obj.geometry.attributes.position.setXYZ(i, pos.x, pos.y, pos.z);
							}
							obj.geometry.attributes.position.needsUpdate = true;
							obj.geometry.computeVertexNormals();

						}
						break;
					}
				}
			}
		}
		function isFixed(idx, fixedIdx) {
			for (var o = 0; o < fixedIdx.length; o++) {
				if (fixedIdx[o] == idx) {
					return true;
				}
			}
		}
		function getNormal(obj, index) {
			var idx = 3 * index;
			var x = obj.geometry.attributes.normal.array[idx];
			var y = obj.geometry.attributes.normal.array[idx + 1];
			var z = obj.geometry.attributes.normal.array[idx + 2];
			return new THREE.Vector3(x, y, z);
		}

		function getPosition(obj, index) {
			var idx = 3 * index;
			var x = obj.geometry.attributes.position.array[idx];
			var y = obj.geometry.attributes.position.array[idx + 1];
			var z = obj.geometry.attributes.position.array[idx + 2];
			return new THREE.Vector3(x, y, z);
		}
		function findParticle(obj, pos) {
			for (var n = 0; n < obj.particles.length; n++) {
				if (obj.particles[n].startposition.clone().distanceTo(pos) < 0.01) {
					return obj.particles[n];
				}
			}
		}
		function findChild(p, idx) {
			for (var n = 0; n < p.children.length; n++) {
				if (p.children[n] == idx) {
					return p.children[n];
				}
			}
		}
		function assureChild(p, idx) {
			var c = findChild(p, idx);
			if (!c) {
				p.children.push(idx);
			}
		}
		function assureParticle(obj, index, child0, child1) {

			var pos = getPosition(obj, index)
			var p = findParticle(obj, pos);
			if (!p) {

				p = {
					index: [],
					children: [],
					dist: [],
					startposition: pos
				}
				p.index.push(index);
				obj.particles.push(p);
			}
			else {
				if (!hasItem(index, p.index)) {
					p.index.push(index);
				}
			}
			assureChild(p, child0);
			assureChild(p, child1);

			return p;
		}
		function hasItem(item, arr) {
			for (var n = 0; n < arr.length; n++) {
				if (arr[n] == item) {
					return true;
				}
			}
		}
		//////////////////////////////////////////////////////////////////////////////////////
		// Copys the world transforms between objects even if the have different parents
		var copyTransform = (function () {
			var scratchMat = new THREE.Matrix4();
			return function (source, destination) {
				destination.matrix.copy(source.matrixWorld);
				destination.applyMatrix(scratchMat.getInverse(destination.parent.matrixWorld));
				return destination.quaternion;
			}
		})();
		async function handleMedia(obj, ele) {
			var att = getAttributes(ele);

			var f = function () {
				activateAudio(obj, att);
			}
			addCallbackFunction(obj, f);
			if (att.volumetric && toB(att.volumetric)) {
				//obj.sound = {};
				//obj.sound.volume = att.volume ? toN(att.volume) : 1;
				checkObjectUpdateArray(obj);
				var f2 = function () {
					if (audioContext && obj.sound) {
						//if (!obj.sound.panner) {
						//	obj.sound.panner = audioContext.createPanner();
						//	// Instead of hooking up the volume to the main volume, hook it up to the panner.
						//	obj.sound.volume.connect(obj.sound.panner);
						//	// And hook up the panner to the main volume.
						//	obj.sound.panner.connect(mainVolume);
						//}
						var p = getWorldPosition(obj);
						obj.sound.panner.setPosition(p.x, p.y, p.z);



						var p = new THREE.Vector3();
						p.setFromMatrixPosition(camera.matrixWorld);
						// And copy the position over to the listener.
						audioContext.listener.setPosition(p.x, p.y, p.z);

					}
				}
				obj.updateArray.push(f2);
			}
		}

		function handleLink(obj, ele) {
			var att = getAttributes(ele);
			if (att.url) {
				var f = function () {

					if (att.target) {
						//
						var iFrameExist = document.querySelector(`iframe[name="${att.target}"]`);
						if (iFrameExist || att.target == "_blank" || att.target == "_self") {
							window.open(att.url, att.target);
						}
						else {
							var replace = att.replace ? att.replace : false;
							var handler = self;
							if (att.handler) {
								var thandler = eval(att.handler);
								if (thandler) {
									handler = thandler;
								}
							}
							handler.loadInTarget(att.target, att.url + '?A=1', replace);
						}
					}
					else {
						window.top.location.href = att.url;
					}
				}
				addCallbackFunction(obj, f);
			}

		}
		function addCallbackFunction(obj, f, action = 'click') {
			var cb = makeCallBackObj(f, action);
			if (!obj.callbackFunctions) {
				obj.callbackFunctions = [];
				obj.callback = function (action) {
					for (var n = 0; n < obj.callbackFunctions.length; n++) {
						var c = obj.callbackFunctions[n];
						if (c.f && c.t == action) { c.f(); }
					}
				}
			}
			obj.callbackFunctions.push(cb);
		}
		function handleRemotePresent(obj, att) {


			addCallbackFunction(obj, function () {
				var remObj = scene.getObjectByName(att.target);
				if (remObj && remObj.present) {
					remObj.present(!remObj.presentProp.isPresenting);
				}
			});

		}

		function handlePresent(obj, ele) {
			var att = getAttributes(ele);
			checkObjectUpdateArray(obj);
			if (att.target) {
				return handleRemotePresent(obj, att);
			}
			var speed = 0.01;
			if (att.speed) {
				speed = Number(att.speed);
			}
			var cameradistance = 1;
			if (att.cameradistance) {
				cameradistance = Number(att.cameradistance);
			}
			var fromgroup;
			if (att.fromgroup) {
				fromgroup = scene.getObjectByName(att.fromgroup);
			}
			obj.presentProp = {};

			obj.presentProp.speed = speed;
			obj.presentProp.cameradistance = cameradistance;
			obj.presentProp.defaultPosition = obj.position.clone();
			obj.presentProp.isPresenting = false;
			obj.presentProp.isRunning = false;
			obj.presentProp.forward = new THREE.Vector3(0, 0, 1);
			obj.presentProp.defaultQuaternion = obj.quaternion.clone();
			var f = function () {
				if (obj.presentProp.isRunning) {
					obj.presentProp.steps--;
					var parent = obj.parent;
					var go = new THREE.Object3D();
					go.quaternion.x = camera.quaternion.x;
					go.quaternion.y = camera.quaternion.y;
					go.quaternion.z = camera.quaternion.z;
					go.quaternion.w = camera.quaternion.w;

					go.position.x = camera.position.x;
					go.position.y = camera.position.y;
					go.position.z = camera.position.z;
					parent.attach(go);

					var vec = new THREE.Vector3(0, 0, -cameradistance);

					vec.applyQuaternion(go.quaternion);
					var target = go.position.clone();
					var source = obj.presentProp.defaultPosition.clone();
					var tocamera = target.clone().sub(source);
					tocamera.normalize();
					target.add(vec);

					var targetQuaternion = go.quaternion.clone();

					if (!obj.presentProp.isPresenting) {
						var target = obj.presentProp.defaultPosition.clone();
						source = obj.position.clone();
						targetQuaternion = obj.presentProp.defaultQuaternion.clone();
					}
					var direction = target.clone();
					direction.sub(source);
					direction.normalize();
					direction.multiplyScalar(speed);

					obj.position.add(direction);

					obj.quaternion.slerp(targetQuaternion, 2 * obj.presentProp.speed)
					var distanceTo = obj.position.distanceTo(target);
					//console.log(target.x + ' ' + target.y + ' ' + target.z + '---- ' + source.x + ' ' + source.y + ' ' + source.z);
					if (distanceTo < 0.1) {
						obj.position.set(target.x, target.y, target.z);
						obj.presentProp.isRunning = false;
						console.log(obj.name + ' stopped');

					}
					parent.remove(go);
				}
			}
			obj.updateArray.push(f);
			obj.present = function (doPresent) {
				if (fromgroup && doPresent) {
					for (var n = 0; n < fromgroup.children.length; n++) {
						if (obj.name != fromgroup.children[n].name && fromgroup.children[n].presentProp && fromgroup.children[n].presentProp.isPresenting) {
							fromgroup.children[n].present(false);
						}
					}
				}
				obj.presentProp.isPresenting = doPresent;
				obj.presentProp.isRunning = true;
				if (obj.children.length > 0) {
					obj.children[0].element.style.zIndex = obj.presentProp.isPresenting ? 10 : canvaszindex - 1;
				}


			}
			if (obj.children.length > 0 && obj.children[0].element) { //is htmlPanel
				var c = obj.children[0].element.children;
				if (c && c.length > 0 && c[0].children.length > 0 && c[0].children[1].name == 'handle') {
					var d = c[0].children[1];
					if (att.presentfromgroup == 'true' && obj.parent.name && obj.name) {
						d.addEventListener("click", function () {
							if (!obj.presentProp.isPresenting) {
								threeml.presentFromGroup(obj.parent.name, obj.name);
							}
							else {
								obj.present(!obj.presentProp.isPresenting);
							}

						});
					}
					else {
						d.addEventListener("click", function () {
							obj.present(!obj.presentProp.isPresenting);
						});
					}
					d.style.display = 'block';
					if (att.class) {
						d.classList.add(att.class);
					}
					if (att.handlecolor) {
						d.style.backgroundColor = att.handlecolor;
					}
				}
			}
			else {
				addCallbackFunction(obj, function () {
					obj.present(!obj.presentProp.isPresenting);
				});
				//obj.callback = function () {  }
			}
			if (att.atstart == 'true') {
				obj.presentProp.isPresenting = true;
				obj.presentProp.isRunning = true;
				if (obj.children.length > 0) {
					obj.children[0].element.style.zIndex = 10;
				}
			}
		}
		function handleDraggable(obj, child) {
			obj.draggable = true;
		}
		function handleWalk(obj, ele) {
			obj.walk = true;
		}
		function handleHover(obj, ele) {
			var att = getAttributes(ele);
			var f = function () {
				var action = att.action ? att.action : 'show';
				var factor = att.factor ? toN(att.factor) : 1.2;
				var o = obj;
				var t;
				if (hoverObject) {
					if (hoverObject.o == obj) {
						t = hoverObject.t;
					}
					else {
						clearHover();
					}
				}
				if (!t && att.target) {
					t = scene.getObjectByName(att.target);
				}

				if (o) {
					if (!o.hoveractions) {
						o.hoveractions = '';
					}
					if (action == 'show' && att.target) {
						t.visible = true;
						if (o.hoveractions.indexOf('show') == -1) {
							o.hoveractions += 'show;';
						}
					}
					else if (action == 'scale' && !o.scaled) {
						if (!o.defaultScale) {
							o.defaultScale = o.scale.clone();
						}
						o.scale.multiplyScalar(factor);
						if (o.hoveractions.indexOf('scale') == -1) {
							o.hoveractions += 'scale;';
						}
						o.scaled = true;
					}
					else if (action == 'color' && !o.colored) {
						if (!o.defaultColor) {
							o.defaultColor = o.material.color.clone();
						}
						var hoverColor = att.color ? toColor(att.color) : new THREE.Color(1, 1, 1);
						o.material.color = hoverColor;;
						if (o.hoveractions.indexOf('color') == -1) {
							o.hoveractions += 'color;';
						}
						o.colored = true;
					}
					hoverObject = {
						o: o,
						t: t
					}

				}

			}

			addCallbackFunction(obj, f, 'hover')
		}
		function handleActions(obj, ele) {
			assureActionProp(obj, ele);

			for (var n = 0; n < ele.children.length; n++) {
				var child = ele.children[n];
				var name = child.localName;
				switch (name) {
					case 'action':
						handleAction(obj, child);
						break;
				}
			}
		}
		function assureActionProp(obj, ele) {
			var att = getAttributes(ele);
			if (!obj.act) {
				obj.act = {};
				obj.act.active = true;
				obj.act.current = 0;
				obj.act.actions = [];
				checkObjectUpdateArray(obj);
				var f = function () {
					if (obj.act && obj.act.active) {
						if (obj.act.actions.length > obj.act.current) {
							var r = obj.act.actions[obj.act.current].call(obj);
							if (r) {
								if (obj.act.actions.length > obj.act.current + 1) {
									obj.act.current++;
								}
								else if (att.repeat) {
									obj.act.current = 0;
								}
								else {
									obj.act.active = false;
								}
							}
						}
					}
				}
				obj.updateArray.push(f);
			}
			if (att.repeat) {
				obj.act.repeat = toB(att.repeat);
			}
		}

		function getTarget(targetName) {
			return scene.getObjectByName(targetName);
		}
		function setVisible(obj, visible) {
			obj.visible = visible;
			if (obj.children) {
				for (var i = 0; i < obj.children.length; i++) {
					setVisible(obj.children[i], visible);
				}
			}
		}
		function handleAction(obj, ele) {
			var att = getAttributes(ele);
			var speed = att.speed ? toN(att.speed) : 0.01;
			var targetName = att.target;
			var target;
			if (targetName) {
				target = getTarget(targetName);
			}
			var visible = att.visible;

			var t = target ? target : obj;
			if (att.typeof || att.type) {
				var ty = att.typeof ? att.typeof : att.type;
				switch (ty) {
					case 'transform':
						var q = t.quaternion.clone();
						if (att.rotation) {
							var rotation = toV(att.rotation);
							rotation.multiplyScalar(Math.PI / 180);
							var euler = (new THREE.Euler()).setFromVector3(rotation, 'XYZ');
							var q = (new THREE.Quaternion()).setFromEuler(euler)
						}
						var position = att.position ? toV(att.position) : t.position.clone();
						var scale = att.scale ? toV(att.scale) : t.scale.clone();
						var color = att.color ? toColor(att.color) : t.color
						var intensity = att.intensity ? toN(att.intensity) : undefined

						var f = function () {
							//visible
							if (visible) {
								var v = toB(visible);
								setVisible(t, v);
							}
							//rotation
							t.quaternion.slerp(q, speed);
							var a = t.quaternion.angleTo(q);
							//position
							t.position.lerp(position, speed);
							var p = position.distanceTo(t.position);
							//scale
							t.scale.lerp(scale, speed);
							var s = scale.distanceTo(t.scale);
							//color
							var cr = true;

							if (color && (t.material && t.material.color || t.color)) {
								var co = t.color ? t.color : t.material.color;
								co.lerp(color, speed);
								var c = co;
								var v1 = new THREE.Vector3(c.r, c.g, c.b);
								var v2 = new THREE.Vector3(color.r, color.g, color.b);

								var d = v1.distanceTo(v2);
								cr = d < 0.02;
							}
							//intensity
							var int = true;
							if (obj.intensity && intensity) {
								var dif = obj.intensity - intensity;
								if (Math.abs(dif) < 0.01) {
									obj.intensity = intensity;
									int = true;
								}
								else {
									obj.intensity -= Math.sign(dif) * speed * 1;
									int = false;
								}
							}

							return a < 0.02 && p < 0.02 && s < 0.02 && cr && int;
						}
						obj.act.actions.push(f);
						break;

					case 'click':
						var f = function () {
							obj.act.active = false;
							return true;
						}
						obj.act.actions.push(f);
						var f2 = function () {
							obj.act.active = true;
						}
						addCallbackFunction(t, f2);
						break;
					case 'pause':
						var f = function () {
							t.visible = visible ? toB(visible) : true;
							if (!obj.act.pause || obj.act.pause <= 0) {
								obj.act.pause = 1;
							}
							obj.act.pause -= speed * 0.1;
							return obj.act.pause < 0;
						}

						obj.act.actions.push(f);
						break;
				}
			}
		}
		function makeCallBackObj(f, t) {
			var c = {
				f: f,
				t: t
			}
			return c;
		}
		function handleFog(ele) {
			var att = getAttributes(ele);
			//const near = att.near ? toN(att.near) : 0.1;
			//const far = att.far ? toN(att.far) : 5;
			const color = att.color ? toColor(att.color) : new THREE.Color('lightblue');
			const density = att.density ? toN(att.density) : 0.00025;
			if (density == 0) {
				scene.fog = null;
				scene.color = null;
			}
			else {
				scene.fog = new THREE.FogExp2(color, density);
				scene.background = color;
			}
		}
		function handleLookAt(obj, ele) {
			var att = getAttributes(ele);
			checkObjectUpdateArray(obj);
			var t = att.target ? scene.getObjectByName(att.target) : camera;
			if (t && t.position) {
				var f = function () {
					obj.lookAt(t.position);
				}
				obj.updateArray.push(f);
			}
			else {
				console.log("Object '" + att.target + "' not found as suitable target.")
			}
		}
		function handleBlink(obj, ele) {
			var att = getAttributes(ele);
			checkObjectUpdateArray(obj);
			var speed = 0.01;
			var random = false;
			if (att.speed) {
				speed = Number(att.speed);
			}
			if (att.random) {
				random = toB(att.random);
			}
			obj.blink = {};
			obj.blink.speed = speed;
			obj.blink.random = random;
			obj.blink.time = 0;
			obj.blink.fact = 1;
			var f = function () {
				obj.blink.time += speed;
				if (obj.blink.time > obj.blink.fact) {
					obj.blink.time = 0;
					obj.visible = !obj.visible
					if (random) {
						obj.blink.fact = Math.random();
					}
				}
			}
			obj.updateArray.push(f);
		}

		function handlePulse(obj, ele) {
			var att = getAttributes(ele);
			checkObjectUpdateArray(obj);
			var speed = 0.01;
			var maxFactor = 1.5;
			if (att.speed) {
				speed = Number(att.speed);
			}
			if (att.maxfactor) {
				maxFactor = Number(att.maxfactor);
			}
			obj.pulse = {};
			obj.pulse.speed = speed;
			obj.pulse.maxFactor = maxFactor;
			obj.pulse.factor = 1;
			obj.pulse.defaultScale = obj.scale.clone();
			var f = function () {
				obj.pulse.factor += obj.pulse.speed;
				var f = obj.pulse.factor;
				obj.scale.x = obj.pulse.defaultScale.x * f;
				obj.scale.y = obj.pulse.defaultScale.y * f;
				obj.scale.z = obj.pulse.defaultScale.z * f;
				if ((obj.pulse.speed > 0 && obj.pulse.factor > obj.pulse.maxFactor)
					|| (obj.pulse.speed < 0 && obj.pulse.factor < 1)) {
					obj.pulse.speed = -obj.pulse.speed;
				}


			}
			obj.updateArray.push(f);
		}
		function handleRotate(obj, ele) {
			checkObjectUpdateArray(obj);
			var att = getAttributes(ele);
			var v = new THREE.Vector3(0, 0.01, 0);
			if (att.axis) {
				v = toV(att.axis);
			}
			var f = function () {
				obj.rotation.x += v.x;
				obj.rotation.y += v.y;
				obj.rotation.z += v.z;
			};
			obj.updateArray.push(f);
		}

		function assureGeometryMat(ele) {

			for (var n = 0; n < ele.children.length; n++) {
				var child = ele.children[n];
				var name = child.localName;
				switch (name) {
					case 'meshphongmaterial':
						return handleMeshPhonMaterial(child);
				}
			}
			return new THREE.MeshPhongMaterial();
		}
		function getAttributes(ele) {
			var att = {};
			if (ele.attributes) {
				for (var n = 0; n < ele.attributes.length; n++) {
					var name = ele.attributes[n].nodeName;
					var val = ele.attributes[n].nodeValue;
					att[name.toLowerCase()] = val;
				}
			}
			return att;
		}

		function handleMeshPhonMaterial(ele) {
			var mat;
			var att = getAttributes(ele);

			if (att.id) {
				mat = findMaterial(att.id);
				if (!mat) {
					mat = new THREE.MeshPhongMaterial();
					mat.name = att.id;
					materials.push(mat);
				}
			}
			else {
				mat = new THREE.MeshPhongMaterial();
			}

			if (att.color) {
				var c = toV(att.color);
				mat.color.setRGB(c.x, c.y, c.z);
			}
			mat.flatShading = false;
			if (att.emissive) {
				var color = att.color ? att.color : "1 1 1";
				var e = toV(color);
				mat.emissive.setRGB(e.x, e.y, e.z);
				if (att.emissiveintensity) {
					mat.emissiveIntensity = toN(att.emissiveintensity);
				}
			}
			if (att.url) {
				try {
					const loader = new THREE.TextureLoader();
					let map = loader.load(att.url);
					if (att.map) {
						var v = toV2(att.map);
						map.wrapS = THREE.RepeatWrapping;
						map.wrapT = THREE.RepeatWrapping;
						map.repeat.set(v.x, v.y);
					}
					mat.map = map
				}
				catch (x) { console.log(x); }
			}
			if (att.normalmap) {
				try {
					const loader2 = new THREE.TextureLoader();
					mat.normalMap = loader2.load(att.normalmap);
				}
				catch (x) { console.log(x); }
			}
			if (att.fog && !toB(att.fog)) {
				mat.fog = false;
			}
			if (att.shininess) {
				mat.shininess = toN(att.shininess);
			}
			if (att.specular) {
				mat.specular = toColor(att.specular);
			}
			if (att.envmap && toB(att.envmap)) {
				if (!cubeCamera) {
					cubeRenderTarget = new THREE.WebGLCubeRenderTarget(128, {
						format: THREE.RGBFormat,
						generateMipmaps: true,
						minFilter: THREE.LinearMipmapLinearFilter,
						encoding: THREE.sRGBEncoding
					});
					cubeCamera = new THREE.CubeCamera(1, 10000, cubeRenderTarget);
					scene.add(cubeCamera);
				}
				mat.envMap = cubeRenderTarget.texture;
				//mat.color.offsetHSL(0.1, - 0.1, 0);
			}
			mat.blending = THREE.NoBlending;
			if (att.side) {
				switch (att.side.toLowerCase()) {
					case 'frontside':
						mat.side = THREE.FrontSide;
						break;
					case 'backside':
						mat.side = THREE.BackSide;
						break;
					case 'doubleside':
						mat.side = THREE.DoubleSide;
						break;
				}
			}

			return mat;
		}
		var cubeRenderTarget;
		var cubeCamera;
		function findMaterial(name) {
			for (var n = 0; n < materials.length; n++) {
				if (materials[n].name == name) {
					return materials[n];
				}
			}
		}


		///////////////////////////////////////////////////////////////////////

		//End common tags
		//Shape





		//End shape

		function toV2(val) {
			var arr = val.split(' ');
			var x = arr.length > 0 ? tryParseNumber(arr[0]) : 0;
			var y = arr.length > 1 ? tryParseNumber(arr[1]) : x;
			return new THREE.Vector2(x, y);
		}
		function toRotV(val) {
			var v = toV(val);
			return new THREE.Vector3(toR(v.x), toR(v.y), toR(v.z));
		}
		function toV(val) {
			var arr = val.split(' ');
			var x = arr.length > 0 ? tryParseNumber(arr[0]) : 0;
			var y = arr.length > 1 ? tryParseNumber(arr[1]) : x;
			var z = arr.length > 2 ? tryParseNumber(arr[2]) : y;

			return new THREE.Vector3(x, y, z);
		}
		function tryParseNumber(val) {
			if (val) {
				var t = parseFloat(val);
				if (isNaN(t)) {
					return 0;
				}
				return t;
			}
			return 0;
		}
		function addTransform(ele, att, parent) {
			var group = new THREE.Group();
			parent.add(group);
			return group;
		}

		function setCommonAttributes(obj, att) {
			if (att.position) {
				var v = toV(att.position)
				obj.position.set(v.x, v.y, v.z);
			}
			if (att.translation) {
				var v = toV(att.translation)
				obj.position.set(v.x, v.y, v.z);
			}
			if (att.scale) {
				var v = toV(att.scale)
				obj.scale.set(v.x, v.y, v.z);
			}
			if (att.rotation) {
				var v = toV(att.rotation);

				obj.rotation.set(toR(v.x), toR(v.y), toR(v.z));
			}
			if (att.name) {
				obj.name = att.name;
			}
			if (att.id) {
				obj.id = att.id;
			}
			if (att.visible) {
				obj.visible = toB(att.visible);
			}
			if (att.intensity) {
				obj.intensity = Number(att.intensity);
			}
			if (att.target) {
				obj.target = Number(att.target);
			}

			if (att.color) {
				obj.color = toColor(att.color);
			}
			if (att.castshadow) {
				obj.castShadow = toB(att.castshadow);
				if (obj.castshadow) {
					obj.scene.traverse(function (node) {

						if (node.isMesh) { node.castShadow = true; }

					});
				}
			}
			if (att.receiveshadow) {
				obj.receiveShadow = toB(att.receiveshadow);
				if (obj.receiveShadow) {
					obj.traverse(function (node) {

						if (node.isMesh) { node.receiveShadow = true; }

					});
				}

			}
			if (att.shadowdarkness) {
				obj.shadowDarkness = Number(att.shadowdarkness);
			}
			if (att.normalize) {
				handelNormalize(obj);
			}
			//if (obj && obj.material && obj.material.envMap && cubeCamera) {
			//	//obj.add(cubeCamera);
			//         }
		}
		function handelNormalize(obj) {
			var bbox = new THREE.Box3().setFromObject(obj);
			var v = bbox.max.clone().sub(bbox.min);
			var maxl = Math.abs(v.x);
			var comp = Math.abs(v.y);
			if (comp > maxl) {
				maxl = comp;
			}
			comp = Math.abs(v.z);
			if (comp > maxl) {
				maxl = comp;
			}
			if (maxl > 0) {
				obj.scale.multiplyScalar(1 / maxl);
			}
			//v.multiplyScalar(0.5);

		}
		function toColor(color) {
			var c = new THREE.Color();
			if (color.indexOf('#') == 0) {
				c = new THREE.Color(color)
			}
			else {
				var v = toV(color);
				c = new THREE.Color(); // create once and reuse
				c.setRGB(v.x, v.y, v.z);
			}
			return c;
		}
		function isNo(n) {
			return !isNaN(parseFloat(n)) && isFinite(n);
		}
		function toN(n, def = 1) {
			if (n && isNo(n)) {
				return Number(n);
			}
			return def;
		}
		function toB(b) {
			if (b) {
				if (b == 'true' || b == '1') {
					b = true;
				}
				else if (b == 'false' || b == '0') {
					b = false;
				}
			}
			return b;
		}
		function toR(degrees) {
			return degrees * Math.PI / 180;
		}
		function toDg(radials) {
			return 180 * radials / Math.PI
		}

		///////////////////////
		function createTreeCss() {
			var style = document.createElement('style');
			style.type = 'text/css';
			style.innerText = `
.maintree{
        position: absolute;
        top: 30px;
    }

.refresh{
        width:30px;
        height:30px;
        display:inline-block;
        background: url('/threeml/images/refresh.svg') no-repeat left;
        background-size: 30px 30px;
        cursor: pointer;
        vertical-align:top;
    }
.save{
        width:30px;
        height:30px;
        display:inline-block;
        background: url('/threeml/images/download.svg') no-repeat left;
        background-size: 30px 30px;
        cursor: pointer;
        vertical-align:top;
}
.refresh:hover{
        background-color: silver;
    }
.objtree{
            display:inline-block;
    }
.node {
        margin-left: 0px;
    }
.ntitle {
    padding-left: 24px;
    cursor: pointer;
    background: url('/threeml/images/closed.svg') no-repeat left ;
	background-color: white;
    background-size: 30px 30px;
    background-position-x: -5px;
	color:black;
}
.ntitle.open {
    background: url('/threeml/images/open.svg') no-repeat left;
    background-size: 30px 30px;
    background-position-x: -5px;
	background-color: white;
}
.ntitle.none {
    background: none;
	background-color: white;
}
.ntitle:hover{
        background-color: silver;
    }
.children {
        margin-left: 10px;
    }
.hide {
        display: none;
    }`;

			document.head.appendChild(style);
		}
		var threediv;
		var maintree;
		function parseScene(scene) {
			createTreeCss();
			maintree = divWithClass('maintree');
			var refresh = divWithClass('refresh');
			refresh.setAttribute('title', 'Reload objects from scene')
			refresh.addEventListener('click', function () {
				refreshTree(threeml.getScene());
			});
			maintree.appendChild(refresh);
			/////////////
			var save = divWithClass('save');
			save.setAttribute('title', 'Upload this ThreeMl page.')
			save.addEventListener('click', function () {
				createTreePage();
			});
			maintree.appendChild(save);
			//////////////
			threediv = divWithClass('objtree');
			threediv.appendChild(check(scene));
			maintree.appendChild(threediv);
			document.body.appendChild(maintree);
		}
		function refreshTree(scene) {
			if (threediv) {
				while (threediv.childNodes.length > 0) {
					threediv.removeChild(threediv.childNodes[0]);
				}
				threediv.appendChild(check(scene));
			}
			else {
				parseScene(scene);
			}
		}
		function divWithClass(className) {
			var div = document.createElement('div');
			div.className = className;
			return div;
		}
		function check(obj) {

			var name = obj.name ? obj.name + ' (' + obj.type + ')' : obj.type;
			var node_div = divWithClass('node');
			var title_div = divWithClass('ntitle');
			title_div.innerText = name;
			title_div.setAttribute('data', obj.id);
			title_div.addEventListener('click', function (event) {
				var n = this.getAttribute('data');
				showGui(n, this.innerText);
				var p = this.parentNode;
				for (var i = 0; i < p.children.length; i++) {
					var c = p.children[i];
					if (c.classList.contains('children')) {
						if (c.classList.contains('hide')) {
							c.classList.remove('hide');
							this.classList.add('open');
						}
						else {
							c.classList.add('hide');
							this.classList.remove('open');
						}
					}

				}
			});
			node_div.appendChild(title_div);
			if (obj.children && obj.children.length > 0) {
				var childrendiv = divWithClass('children hide');

				for (var i = 0; i < obj.children.length; i++) {
					childrendiv.appendChild(check(obj.children[i]));
				}
				node_div.appendChild(childrendiv);
			}
			else {
				title_div.classList.add('none');
			}
			return node_div;
		}
		const lf = '\r\n';
		const tb = '   ';
		function createTreePage() {
			var h = '';
			h += '<html>' + lf;
			h += tb + '<head>' + lf;
			h += tb + tb + '<style>' + lf;
			h += tb + tb + tb + '#container {' + lf;
			h += tb + tb + tb + tb + 'pointer-events: none;' + lf;
			h += tb + tb + tb + '}' + lf;
			h += tb + tb + '</style>' + lf;
			h += tb + '</head>' + lf;
			h += tb + '<body>' + lf;
			h += tb + tb + '<div id="container">' + lf;
			h += tb + tb + tb + '<three>' + lf;
			h += checkChildren(scene, 3);
			h += tb + tb + tb + '</three>' + lf;
			h += tb + tb + '</div>' + lf;

			h += tb + '<script>' + lf;
			h += tb + tb + 'var threeml;' + lf;
			h += tb + '</script>' + lf;
			h += tb + '<script type="module">' + lf;
			h += tb + tb + '//Remember to have the threeml folder copied here!' + lf;
			h += tb + tb + 'import { ThreeML } from \'./threeml/threeml.js\'' + lf;
			h += tb + tb + 'threeml = new ThreeML();' + lf;
			h += tb + tb + 'threeml.parseThree();' + lf;
			h += tb + '</script>' + lf;
			h += tb + '</body>' + lf;
			h += '</html>';
			h = h.replaceAll(lf + lf, lf);

			downloadBlob(h, "threemlexample.html", "text/html");
		}


		function downloadBlob(content, fileName, contentType) {
			if (Blob !== undefined) {

				var blob = new Blob(["\ufeff", content], { type: contentType });
				if (navigator.msSaveBlob) {
					return navigator.msSaveBlob(blob, fileName);
				}
				clickAref(URL.createObjectURL(blob), fileName);
			} else {
				clickAref(encodeURIComponent(content), fileName);
			}
		}
		function clickAref(href, download, useBlankTaget) {
			var link = document.createElement("a");
			link.setAttribute("href", href);
			if (download) {
				link.setAttribute("download", download);
			}
			if (useBlankTaget) {
				link.setAttribute("target", "_blank");
			}
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);

		}


		function tryGetIframe(obj) {
			var css3d = obj.children[0];
			var maindiv = css3d.element;
			if (maindiv && maindiv.childNodes && maindiv.childNodes.length > 1) {
				var iframe = maindiv.childNodes[1];
				return iframe;
			}

		}
		function checkChildren(obj, level, isThreeMParent = false) {
			var h = '';
			level++;
			var tabs = '';
			for (var i = 0; i < level; i++) {
				tabs += tb;
			}
			var tagName = obj.type;
			if (isThreeMParent && (tagName == 'Mesh' || tagName == 'Object3D')) {
				tagName = undefined;
			}
			if (tagName && tagName.length > 0 && tagName != 'Scene') {
				if (tagName == 'Mesh' && obj.geometry && obj.geometry.type) {
					tagName = obj.geometry.type;
				}
				var url;
				var zoom;
				if (obj.url) {
					url = obj.url;
				}
				if (obj.threemlType) {
					tagName = obj.threemlType;
					isThreeMParent = true;
					if (tagName == "HtmlPlaneGeometry") {
						var ifr = tryGetIframe(obj);
						if (ifr) {
							url = ifr.src;
							if (ifr.style.zoom != "1") {
								zoom = Number(ifr.style.zoom);
							}
						}
					}

				}

				h += tabs + '<' + tagName;
				if (obj.name) {
					h += ' name="' + obj.name + '"';
				}
				if (url) {
					h += ' url="' + url + '"';
				}
				if (zoom) {
					h += ' zoom="' + round(zoom) + '"';
				}
				if (!obj.visible) {
					h += ' visible="false"';
				}
				if (obj.position && obj.position.length() > 0) {
					h += ' position=' + Vector3ToString(obj.position);
				}
				if (obj.rotation && (obj.rotation.x != 0 || obj.rotation.y != 0 || obj.rotation.z != 0)) {
					h += ' rotation=' + Vector3ToString(obj.rotation, 180);
				}
				if (obj.scale && (obj.scale.x != 1 || obj.scale.y != 1 || obj.scale.z != 1)) {
					h += ' scale=' + Vector3ToString(obj.scale);
				}

				if (obj.intensity && obj.intensity != 1) {
					h += ' intensity="' + round(obj.intensity) + '"';
				}
				if (obj.target && obj.target.name) {
					h += ' target="' + obj.target.name + '"';
				}
				if (obj.castShadow) {
					h += ' castShadow="true"';
				}
				if (obj.recieveShadow) {
					h += ' recieveShadow="true"';
				}
				if (obj.color && (obj.color.r != 1 || obj.color.g != 1 || obj.color.b != 1)) {
					h += ' color=' + ColorToString(obj.color);
				}

				h += '>';
				if (obj.material) {
					var mat = obj.material
					var matName = mat.type;
					h += lf + tabs + tb + '<' + matName;
					if (mat.color) {
						h += ' color=' + ColorToString(mat.color);
					}
					if (mat.emissive && (mat.emissive.r != 0 || mat.emissive.g != 0 || mat.emissive.b != 0)) {
						h += ' emissive=' + ColorToString(mat.emissive);
					}
					if (mat.map && mat.map.image && mat.map.image.src && mat.map.image.src.length > 0) {
						h += ' url="' + mat.map.image.src + '"';
					}
					h += '></' + matName + '>' + lf;
				}
				if (obj.presentProp) {
					var pp = obj.presentProp
					var tagtName = 'present';
					h += lf + tabs + tb + '<' + tagtName;
					if (pp.speed) {
						h += ' speed="' + pp.speed + '"';
					}
					if (pp.cameradistance) {
						h += ' cameradistance="' + pp.cameradistance + '"';
					}
					h += '></' + tagtName + '>' + lf;
				}
				if (obj.draggable) {
					h += tabs + tb + '<draggable></draggable>' + lf;
				}
			}
			if (obj.children) {
				if (obj.children.length > 0) {
					h += lf;
				}
				else {
					tabs = '';
				}
				for (var i = 0; i < obj.children.length; i++) {
					h += checkChildren(obj.children[i], level, isThreeMParent);
				}
			}
			if (tagName && tagName.length > 0 && tagName != 'Scene') {
				h += tabs + '</' + tagName + '>' + lf;
			}
			return h;
		}
		function ColorToString(c) {
			var v = new THREE.Vector3(c.r, c.g, c.b);
			return Vector3ToString(v);
		}
		function Vector3ToString(v, fact = 1) {
			if (v.x == v.y && v.y == v.z) {
				return '"' + round(v.x * fact) + '"';
			}
			return '"' + round(v.x * fact) + ' ' + round(v.y * fact) + ' ' + round(v.z * fact) + '"';
		}
		function round(n) {
			if (Number(n.toFixed(2)) == n) {
				return n;
			}
			return n.toFixed(2);
		}
	}
	const FixHandle = {
		NONE: 'none',
		TOGGLE: 'toggle'
	}
	const SoftBodyConstraint = {
		FIXED: 'fixed',
		WIND: 'wind',
		GRAVITY: 'gravity',
		STRETCH: 'stretch',
		NORMAL: 'normal',
		FLOOR: 'floor',
		STRUCTURE: 'structure',
		DRAG: 'drag',
		GRAB: 'grab'
	}
	const GrabMode = {
		NONE: 'none',
		INIT: 'init',
		DRAG: 'drag'


	}
	const CameraMode = {
		FIXED: 'fixed',
		LOOKAT: 'lookat',
		SCAN: 'scan',
		CLICK: 'click',
		DRAG: 'drag'
	}
	const Images = {
		MagnifyImage: "data:image/png;base64,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",
		ArrowLeft: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAR+SURBVGhD7ZddbBRVFMfvvTuzO92lW6CkoDVGE6kxfkSbmBgC5aWEBxPbpE00NbR9oSH0wQZ8AR7aYLTxA61JI1pCYxAwMUCKiYlGIQJtFSmJVYLSahU/aLd0293udr5nrufO3Nl+UbdvOw/zSzvn3HPPnTv/e/be2UUBAQEBAQEBAQEB+cDcroq+X81NX/5052gqq5TFRdzes6viG95VcAi3ebn0Dy2+8Vfyi/HpbK1moS2TGfVc5/mRUt5dcFYlZGCChq+NJs8O/X63klKKbNNAiqIU/zmefISnFJy8Qi7foXhodKZ38FZih0URskDEXCaNsDyTLJOsmzyt4OQVMjyWeqv/l/GXDRsqYZlIV2VEszNKzJqrea15a4anFZz/FdI9kGobvDXxqmrayLYtpGsKsrMpqyxiNZztqBvgab5gRSHd/ekXr45MHMmqJoiwkaEqyMqm0MaI0frpoZo+nuYb7ink+NVs3fWxxOkZWSc2BRGaigwQcb9kHD59sOYjnuYrlgnpGZytGhwZP3k3oxIEJ5ShayAijTaF9ePNVQ938DTfsUhIz3ezTwyNTZ5PpGWJHbOeiJiVPVX/bPme6i1PwrnlT3Jv9g8H0uXDt6e+/3s68wCFsKnrSJdnURikxkvLEjgkmISEECaedhjKRjNp/C5wsC1h+RcH6gzgcJfFYN3gf8kNoO3k58IUSQJZTzCOqIZ5Ix4JNfU2VvzIenIzNfXePJWc0xuYCPauQLA3wlIRImLYTcJuKuaWDXVdL+4YgLedK5BzFrmLmH/OhUJcAW7Ec1zBrqWIUHrhTMtj1SySu3fNu4PXDUGqZCECq05CsPpOD1wdh7cW+J5hDnPdSV1yXZyFfS48AsZ7OJf5h3WurMHbC0UwGyH08rnWyu0smpuv/u2Lr6QM0iVE1yAoHXy0NLcyi1j6eAAPYXfeBcwHmOekuU/C4X4u5Dlg4c9ZMDffZgFvZtdCG6M/4kVSw2f7qn6Yj3NqOr9ul6nYIcbiKCJJyDJ0ZKpzKIa0n2HPvMdyxBBB0QhUC2M7mdUTTHSIQBUxVNGxGJVEBSSAn5KNKd20DRGqy2YSYCxjXVREMbgH9M39O6PMhoUQ5BMkCsTJKZFEtHljEUu1m3Y+PuUMysMiIYyXjlw8kNTw62KsBDMxsBzOxl8n0vaTe5457Gb5j2VCGI3vf7t/QkbvhKJuZbxTrDRC3zjR8vQhnuYr7imE0dh1qSWh0KMkGidMDPtQGiBmrWB3bt4QPdhR/yjP9AfL3uweJ9q295SvIc22nDY0RXE2nhgOo5RJDoxOyW/yNN+wYkU8Wj64Un87bX6Ci+KSVAQbEDY1q8z6sN1V99SGfbXPwfvTB6xYEY+evdvOPFgi1BI1o6pQGQovSlaZaR239Q0nnudpBSevEMaxvdu+Ki8WdoS0TEaT4YcVfK1nB4CsahU8peCsSgjjWOvW/ofWhquxmpmU4aculVNKMTE+590FJ+8eWcru7iv3ZRTtBYlYFz7ev/M3Hg4ICAgICAgICAjwOwj9B9ip7KxI4EoZAAAAAElFTkSuQmCC",
		ArrowRight: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAARjSURBVGhD7ZddaBxVFMfPzM7Obj62iSY0paHUQhGRVkWpSGyqtAn4ICTYomBUQh+kH4JR60NbkETRopCCUkE3VEjU6EMiTcWHgC8tSbQY6wdq6QaDSDQf7WY/Mzuzd+Zez525M8lgk/ggZB7m9zDn3nPO3Dn/nblnZiEkJCQkJCQkJCRkPSRhA8HzH6da8oT11FZXLDx2z9aj7XcpcyK0LrKwG86ZkVTdQkH/wrCgaXax2P7Ln+mvLs2whAivS2CE/DGb3lkqlRLUJMAYg8nfb9z/3VR6eHyOqSJlTQIjZHPc+k3SMumlQg4sFGMxgInr862TU5mPLv/N1t0CgRHyRufeQpW11MaKmVJZ14BaJhDKYOzabMdP09l3RNqqBEYIZ7j74PjmmPU0LWatslECSi3QTYp3Zu7EufFsl0i7JYESwvnsdNuFhhg5bhWzQHQuhkJRN+FKaq733FjuKZH2LwInhDN4qu3DrXHyOuFiDB0oo5DRyvL30/OD568UD4o0H4EUwunct6N7i1o+T4o5IGUDsJXBjYIuT6RmP0lO5PeJNI/ACmlp2s0O7Wk8UmUVP3XF8LY8n9Pik9MLI8lv8rtEqo3X1g4PpO7LG1Z/PKrsoowZuMkWvTAayT74u6CEc+6yY7bDMRzP5wN76gpkN4W7+dgOOzkM9wbf7MwylXx6oaFMAdTKTaCoKqYy2HZ7Yube7fUPHXm45i+e713tUPLa11SSDvDi7DLsCB6Edafi4CCErfD48JUtJss+UbDnYGLs+kUALR9RUoYybn6QZIgoUbwmg7oqdbD/8N0dPM2r4Yn3r14yqITPHhfB3X4xjs+Ze34bMXenywMb/8wt04HHRNn2cTnoiuLgwB4LQZZldzI+j5r61ZGXmx7gUe86T569/GC+pA/iAju4213HsXaazCu2L2BP3VOF9VbyBjh01lnhQfwz753tXtCH38nvhKLGsIsxMLUi1EZp19Cr+9/lMf+qa9A/+ms9GnlqvgQ5nYBpUSD4sjLx1ymbFjTeVrFJVeSqJfzqy2jEPofn8FoI/ooYi9ZWRutNfFvnNNMuhuKYt1bLtvioVKsN+EjJGq5B+LkI7omXliC2W4lXQSSqgqHrQJbyUCmR7pGTrT12EvKfhWwEz3zww2sZIvXwDc7bqyMix+pi7PTnr+w/42Q5BFbIc8kf30wb0im3S3ERlpaHLZVwYuDFR3tFmkfghHQPXYepm9pbWVM+GUURfFNyEVTL04YK6ehA1yNJkeojcC9EFPG2T0QJv7e0HGmsljtXE8EJzB258O2MNPzzzbOLZbnLEUFBRxGslNe31yjPJo81D4nUWxIRdsOJ7+l4PE0i70WxvTIUwe+ErBf0bTVKe9+x5i9F2qoE5tHSdONOxrc1tnND0yBiFAqNCaUVRYyKlDUJjJCETC4yLVvS8K+upBcW7qhVW/qO7x0T4XUJVNfq7B3dqdPIgURF7GLfC82zwh0SEhISEhISEhLyfwDwD8Z+Cxj9p9dsAAAAAElFTkSuQmCC",
		Home: "data:image/png;base64,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",
	}
}
export { ThreeML };
