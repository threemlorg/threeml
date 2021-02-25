//import { isNumeric } from 'jquery';
import * as THREE from './build/three.module.js';
import { GLTFLoader } from './controls/GLTFLoader.js';
import { CSS3DObject, CSS3DRenderer } from './renderers/CSS3DRenderer.js';
import {DefaultFont} from './fonts/defaultfont.js'
import { VRButton } from './controls/VRButton.js';


/**
 * Based on http://www.v-slam.org/
 */

var ThreeScenes = []
var camera;
var scene;
var rendererCSS;
var rendererMain;


var ThreeML = function (element) {
	const loader = new GLTFLoader();
	const defaultFont = new DefaultFont();
	var defaultLookat;
	var navigating;
	var scenes = [];
	const cameraMaxXangleDef = 0.3;
	const cameraMaxYangleDef = 0.5;
	var cameraMaxXangle = cameraMaxXangleDef;
	var cameraMaxYangle = cameraMaxYangleDef;
	var self = this;

	window.addEventListener('resize', onWindowResize, false);
	document.onmousemove = handleMouseMove;



	this.show = function (objectName, doShow = true) {
		for (var n = 0; n < scenes.length; n++) {
			var scene = scenes[n];
			var object = scene.getObjectByName(objectName);
			doShowObject(object, doShow);
		}
	}
	function doShowObject(object, doShow){
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
	this.showFromGroup=function(groupName, objectName){
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
	this.present = function (objectName, doPresent=undefined) {
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
			for (var n = 0; n < obj.children.length;n++) {
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
			if (domgroup.length===2 && domgroup[1].localName==="iframe") {
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
	var raycaster = new THREE.Raycaster();
	var mouse = new THREE.Vector2();
	var mousePos;
	var allObjects = [];
	var avatarheight=1.7;
	function onWindowResize() {

		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();

		rendererCSS.setSize(window.innerWidth, window.innerHeight);
		rendererMain.setSize(window.innerWidth, window.innerHeight);
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
	function onDocumentMouseDown(event) {
		var intersected = getRayCastedObject();
		if (intersected) {
			if (intersected.eventParent) {
				intersected = intersected.eventParent;
            }
			if (intersected.callback) {
				event.preventDefault();
				intersected.callback();
			}
			else if (intersected.walk) {
				var point = getPoint(intersected)
				if (!point) { return;}
				camera.targetPosition = new THREE.Vector3(point.x, point.y+avatarheight, point.z);
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
	function handleMouseMove(event) {
		var dot, eventDoc, doc, body, pageX, pageY;

		event = event || window.event; // IE-ism
		mousePos = {
			x: event.clientX,
			y: event.clientY
		};
		check3dLinkForCursor();
	}
	function getRayCastedObject() {
		var mouse = new THREE.Vector2();
		mouse.x = (mousePos.x / window.innerWidth) * 2 - 1;
		mouse.y = - (mousePos.y / window.innerHeight) * 2 + 1;
		var raycaster = new THREE.Raycaster();
		raycaster.setFromCamera(mouse, camera);
		var intersects = raycaster.intersectObjects(allObjects);
		if (intersects.length > 0 && intersects[0].object) {
			intersects[0].object.point = intersects[0].point;
			return intersects[0].object;
		}
    }
	function fillAllObjects() {
		allObjects = [];
		scene.traverse(function (child) { allObjects.push(child); });
    }
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
		}
		document.body.style.cursor =c;
    }
	//////////////////////////////////////////







	this.parseThree = function (obj) {
		if (!obj) {
			obj = document;
        }
		var threeParts = obj.getElementsByTagName('three');
		for (var n = 0; n < threeParts.length; n++) {
			var threeScene;
			if (ThreeScenes.length == 0) {
				threeScene = new ThreeScene(threeParts[n]);
				ThreeScenes.push(threeScene);
			}
			else {
				threeScene = ThreeScenes[0];
            }
			threeScene.parseChildren(threeParts[n]);
			camera.updateMatrixWorld();
		}
	}


	var ThreeScene = function (threenode) {
		var controls;
		var materials = [];
		var canvaszindex = 0;
		init(threenode);
		animate();

		function init(X3Dnode) {
			var container = X3Dnode.parentNode;

			var innerWidth = window.innerWidth;
			var innerHeight = window.innerHeight;
			if (container.localName == 'div') {
				//innerWidth = parent.width;
				//innerHeight = parent.height;
            }
			
			camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.01, 2000);
			//camera = new THREE.OrthographicCamera(-0.5 * innerWidth, 0.5 * innerWidth, -0.5 * innerHeight, 0.5 *innerHeight, 0.1, 20000);
			//camera.position.set(0, 0, 10);
			scene = new THREE.Scene();
			scenes.push(scene);
			camera.position.set(0, 0, 0);
			camera.eulerOrder = "YXZ";
			navigating = CameraMode.FIXED;
			rendererCSS = new CSS3DRenderer();
			rendererCSS.setSize(innerWidth, innerHeight);
			container.appendChild(rendererCSS.domElement);


			// put the mainRenderer on top
			rendererMain = new THREE.WebGLRenderer({ antialias: true, alpha: true });
			rendererMain.setClearColor(0x000000, 0);
			rendererMain.domElement.style.position = 'absolute';
			rendererMain.domElement.style.top = 0;
			rendererMain.domElement.style.zIndex = 1;
			rendererMain.setSize(innerWidth, innerHeight);
			rendererMain.xr.enabled=true;
			rendererCSS.domElement.appendChild(rendererMain.domElement);

			var light = new THREE.AmbientLight(0x555555);
			light.position.set(100, 250, -100);
			scene.add(light);
			//document.body.appendChild(VRButton.createButton(rendererMain));
			window.addEventListener('click', onDocumentMouseDown, false);
		}

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
			rendererMain.setAnimationLoop(doAnimate);
			//requestAnimationFrame(animate);
			//doAnimate();
		} 
		function doAnimate() {
			fillAllObjects();
			checkCam();
			scene.traverse(obj => {
				if (typeof obj.update === 'function') {
					obj.update();
				}
			});
			if (camera.update) {
				camera.update();
            }
			rendererCSS.render(scene, camera);
			rendererMain.render(scene, camera);

        }
		function checkCam() {
			if (navigating != CameraMode.FIXED) {
				if (mousePos && defaultLookat) {
					var intersected = getRayCastedObject();
					if (intersected && ((intersected.geometry && intersected.geometry.type == 'PlaneGeometry')
						|| (intersected.present || intersected.callback))) {
						return;
					}
					var x = mousePos.x - (0.5 * window.innerWidth) + defaultLookat.x;
					var y = mousePos.y - (0.5 * window.innerHeight) + defaultLookat.y;
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
						if (camera.rotation.y > cameraMaxYangle || camera.rotation.y < -cameraMaxYangle ) {
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


		function rotateCameraToObject(object3D, t) {

			var cameraPosition = camera.position.clone();               // camera original position
			var cameraRotation = camera.rotation.clone();               // camera original rotation
			var cameraQuaternion = camera.quaternion.clone();           // camera original quaternion

			var dummyObject = new THREE.Object3D();                     // dummy object


			// set dummyObject's position, rotation and quaternion the same as the camera
			dummyObject.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
			dummyObject.rotation.set(cameraRotation.x, cameraRotation.y, cameraRotation.z);
			dummyObject.quaternion.set(cameraQuaternion.x, cameraQuaternion.y, cameraQuaternion.z);


			// lookAt object3D
			dummyObject.lookAt(object3D);

			// store its quaternion in a variable
			var targetQuaternion = dummyObject.quaternion.clone();
			camera.quaternion.slerp(targetQuaternion, t);
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
			var tr=parent;
			switch (name) {
				
				case 'camera':
					return handleCamera(ele, parent);
					break;
				case 'renderer':
					handleRenderer(ele);
					break;
				case 'canvas':
					handleCanvas(ele);
					break;
				case 'waitobject':
					return handleWaitObject(ele, parent);
					break;
				case 'planegeometry':
					return handlePlaneGeometry(ele, parent);
					break;
				case 'spheregeometry':
					return handleSphereGeometry(ele, parent);
					break;
				case 'boxgeometry':
					return handleBoxGeometry(ele, parent);
					break;
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
				case 'ambientlight':
					return handleDAmbientionalLight(ele, parent);
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
				case 'sound':
					return handleSound(ele, parent);
					
					break;
			}
			doParseChildren(ele, tr);
		}
		function handleSound(ele, parent) {
			var att = getAttributes(ele);
			if (att.url) {
				var x = document.createElement("AUDIO");
				x.setAttribute("src", att.url);
				x.setAttribute("controls", "controls");
				if (att.loop && att.loop == "true") {
					//x.setAttribute("loop", "true");
					x.loop = true;
				}
				if (att.volume) {
					x.volume = toN(att.volume)
				}
				if (att.autoplay && att.autoplay == 'true') {
					x.load();
					//x.addEventListener("load", function () {
					//	this.play();
					//}, true);
                }
				document.body.appendChild(x);

				
            }
		}
		function handleGroup(ele, parent) {
			var att = getAttributes(ele);
			var obj = new THREE.Group();
			setCommonAttributes(obj, att);
			checkevents(ele, obj);
			parent.add(obj);
			return obj;
		}
		function handleGltfLoader(ele, parent) {
			var att = getAttributes(ele);
			var att = getAttributes(ele);
			if (att.name) {
				var tobj = scene.getObjectByName(att.name);
				if (tobj) {
					return tobj;
				}
			}
			if (att.url) {
				var p = "0";
				if (att.position) {
					p = att.position;
				}
				p = parse3DVector(p)
				showWaitModel(parent, p );
				const gltfLoader = new GLTFLoader();
				gltfLoader.load(att.url, (gltf) => {
					const root = gltf.scene;
					setCommonAttributes(root, att);
					var hasMouseEvent=checkevents(ele, root);
					if (hasMouseEvent) {
						setEventParent(root, root);
                    }
					hideWaitModel(parent);
					parent.add(root);
				});
			}
		}
		function setEventParent(parent, ele) {
			for (var n = 0; n < ele.children.length; n++) {
				var ch = ele.children[n];
				setEventParent(parent, ch);
				if (ch.type == "Mesh") {
					ch.eventParent = parent;
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
							rt.fromEquirectangularTexture(rendererMain, texture);
							scene.background = rt;
						});
				}
				else {
					scene.background = '';
                }
			}
		}

		function handleHtmlPlaneGeometry(ele, parent) {
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
			var w = 1920;
			var h = 1080;
			if (att.width) {
				w = att.width;
			}
			if (att.heigth) {
				w = att.heigth;
			}

			div.style.width = w + 'px';
			div.style.height = h + 'px';

			div.style.backgroundColor = '#000';

			//action button:
			const div_h = document.createElement('div');
			div_h.style.width = '100px';
			div_h.style.height = '50px';
			div_h.title = 'Present';
			div_h.style.backgroundColor = 'lightblue';
			div_h.style.cursor = 'pointer';
			div_h.style.border = 'solid';
			div_h.style.float = 'right';
			div_h.name = 'handle';
			div_h.style.display = 'none'
			div_h.style.padding = '5px';
			div.appendChild(div_h);
			const img = document.createElement('img');
			img.src = "data:image/png;base64,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";
			img.style.width = '100%'
			img.style.height = '100%'
			div_h.appendChild(img);

			const iframe = document.createElement('iframe');
			iframe.style.width = w + 'px';
			iframe.style.height = h + 'px';
			iframe.style.border = '0px';
			iframe.name = att.name;
			if (att.scrolling) {
				var scr = toB(att.scrolling);
				if (!scr) {
					iframe.scrolling = 'no';
                }
            }
			if (att.zoom) {
				iframe.style.zoom = att.zoom;
			}
			div.appendChild(iframe);
			if (att.url) {
				iframe.src = att.url;
			}
			else if (att.html) {
				//div.style.backgroundColor = '#FFF';
				iframe.srcdoc = att.html;
			}



			const obj = new CSS3DObject(div);

			holder.add(obj);

			//add transparantplane
			var geometry = new THREE.PlaneGeometry(1.53,0.92);
			var material = new THREE.MeshBasicMaterial();
			material.color.set('black'); //red
			//material.wireframe = true;
			//material.wireframeLinewidth = 3;
			material.opacity = 0;
			material.blending = THREE.NoBlending;
			var p = new THREE.Mesh(geometry, material);
			p.position.set(0, -0.027, 0);
			holder.add(p);


			setCommonAttributes(holder, att);
			var v = obj.scale;
			obj.scale.set(0.0008 * v.x, 0.0008 * v.y, 0.0008 * v.z);
			checkevents(ele, holder);
			return obj;

		};
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
				var v = parse3DVector(att.position)
				camera.position.set(v.x, v.y, v.z);
            }
			if (att.rotation) {
				var v = parse3DVector(att.rotation)
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
				var v = parse3DVector(att.clearcolor);
				var c = new THREE.Color(); // create once and reuse
				c.setRGB(v.x, v.y, v.z);
				rendererMain.setClearColor(c);//0xb0f442);
			}

        }
		function handlePlaneGeometry(ele, parent) {
			var att = getAttributes(ele);
			var geometry = new THREE.PlaneBufferGeometry(1,1);
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
		function handleSphereGeometry(ele, parent) {
			var att = getAttributes(ele);
			//radius : Float, widthSegments : Integer, heightSegments : Integer, phiStart : Float, phiLength : Float, thetaStart : Float, thetaLength : Float
			var radius = att.radius ? toN(att.radius) : 1;
			var widthSegments = att.widthsegments ? toN(att.widthsegments) : 30;
			var heightSegments = att.heightsegments ? toN(att.heightsegments) : 30;
			var phiStart = att.phistart ? toN(att.phistart) : 0;
			var phiLength = att.philength ? toN(att.philength) : 2*Math.PI;
			var thetaStart = att.thetastart ? toN(att.thetastart) : 0;
			var thetaLength = att.thetalength ? toN(att.thetalength) : Math.PI;
			
			var geometry = new THREE.SphereBufferGeometry(radius, widthSegments, heightSegments, phiStart, phiLength, thetaStart, thetaLength);
			var material = assureGeometryMat(ele);
			var obj = new THREE.Mesh(geometry, material);
			geometry.computeVertexNormals();
			checkevents(ele, obj);
			setCommonAttributes(obj, att);
			parent.add(obj);
			return obj;

		}
		function handleCircleGeometry(ele, parent) {
			var att = getAttributes(ele);
			var geometry = new THREE.CircleGeometry();
			var material = new THREE.MeshBasicMaterial({ color: 0xffff00 });// assureGeometryMat(ele);
			var obj = new THREE.Mesh(geometry, material);
			checkevents(ele, obj);
			setCommonAttributes(obj, att);
			parent.add(obj);
			return obj;

		}
		function handleConeGeometry(ele, parent) {
			var att = getAttributes(ele);
			var radius = att.radius ? toN(att.radius): 1;
			var height = att.height ? toN(att.height) : 1;
			var radialSegments = att.radialsegments ? toN(att.radialsegments) : 8;
			var geometry = new THREE.ConeGeometry(radius, height, radialSegments);
			var material =  assureGeometryMat(ele);
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
			var arc = att.arc ? toN(att.arc) : 2*Math.PI;
			var geometry = new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments, arc);
			var material = assureGeometryMat(ele);
			var obj = new THREE.Mesh(geometry, material);
			checkevents(ele, obj);
			setCommonAttributes(obj, att);
			parent.add(obj);
			return obj;
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
			var thetaLength = att.thetalength ? toN(att.thetalength) : 2*Math.PI;



			var geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, heightSegments, openEnded, thetaStart, thetaLength);
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
			light.castShadow = true;
			if (att.target) {
				var obj = scene.getObjectByName(att.target);
				if (obj) {
					light.target = obj;
                }
            }
			parent.add(light);
			//var helper = new THREE.DirectionalLightHelper(light);
			//helper.position.set(0, 0, -2);
			//parent.add(helper);
			return light;

		}
		function handleDAmbientionalLight(ele, parent) {
			var att = getAttributes(ele);
			if (att.name) {
				var tobj = scene.getObjectByName(att.name);
				if (tobj) {
					return tobj;
				}
			}
			var light = new THREE.AmbientLight();
			setCommonAttributes(light, att);
			parent.add(light);
			return light;

		}

		function handleTextGeometry(ele, parent) {
			var att = getAttributes(ele);
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
				var obj = scene.getObjectByName(att.target);
				if (obj) {
					light.target = obj;
				}
			}

			parent.add(obj);
			return obj;

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
		//}


		// Copys the world transforms between objects even if the have different parents
		var copyTransform = (function () {
			var scratchMat = new THREE.Matrix4();
			return function (source, destination) {
				destination.matrix.copy(source.matrixWorld);
				destination.applyMatrix(scratchMat.getInverse(destination.parent.matrixWorld));
				return destination.quaternion;
			}
		})();


		function handleLink(obj, ele) {
			var att = getAttributes(ele);
			if (att.url) {
				var f = function () {
					if (att.target) {
						var iFrameExist = document.querySelector(`iframe[name="${att.target}"]`);
						if (iFrameExist || att.target == "_blank" || att.target == "_self") {
							window.open(att.url, att.target);
						}
						else {
							var replace = att.replace ? att.replace : false;
							self.loadInTarget(att.target, att.url+'?A=1', replace);
						}
					}
					else {
						window.top.location.href = att.url;
                    }
				}
				addCallbackFunction(obj, f);
            }

        }
		function addCallbackFunction(obj, f) {
			if (!obj.callbackFunctions) {
				obj.callbackFunctions = [];
				obj.callback = function () {
					for (var n = 0; n < obj.callbackFunctions.length; n++) {
						obj.callbackFunctions[n]();
                    }
                }
			}
			obj.callbackFunctions.push(f);
        }
		function handleRemotePresent(obj, att){
			var remObj = scene.getObjectByName(att.target);
			if (remObj && remObj.present) {
				addCallbackFunction(obj, function () {
					remObj.present(!remObj.presentProp.isPresenting);
				});
            }
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

			obj.presentProp = {};

			obj.presentProp.speed = speed;
			obj.presentProp.cameradistance = cameradistance;
			obj.presentProp.defaultPosition = obj.position.clone();
			obj.presentProp.isPresenting = false;
			obj.presentProp.isRunning = false;
			obj.presentProp.forward = new THREE.Vector3(0, 0, 1);
			obj.presentProp.defaultQuaternion=obj.quaternion.clone();
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

					obj.quaternion.slerp(targetQuaternion, 2*obj.presentProp.speed)
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
				obj.presentProp.isPresenting = doPresent;
				obj.presentProp.isRunning = true;
				if (obj.children.length > 0) {
					obj.children[0].element.style.zIndex = obj.presentProp.isPresenting ? 10 : canvaszindex-1;
				}

			}
			if (obj.children.length > 0) { //is htmlPanel
				var c = obj.children[0].element.children;
				if (c && c.length > 0 && c[0].name == 'handle') {
					var d = c[0];
					if (att.presentfromgroup=='true' && obj.parent.name && obj.name) {
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
		function handleWalk(obj, ele) {
			obj.walk = true;
		}
		function handleLookAt(obj, ele) {
			var att = getAttributes(ele);
			checkObjectUpdateArray(obj);
			var f = function () {
				obj.lookAt(camera.position);
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
				v = parse3DVector(att.axis);
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
			for (var n = 0; n < ele.attributes.length; n++) {
				var name =ele.attributes[n].nodeName;
				var val = ele.attributes[n].nodeValue;
				att[name.toLowerCase()]=val;
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
			var c = parse3DVector(att.color);
			mat.color.setRGB(c.x, c.y, c.z);
		}
		mat.flatShading = true;
		
		if (att.url) {
			try {
				const loader = new THREE.TextureLoader();
				mat.map = loader.load(att.url);
			}
			catch (x) {  console.log(x); }
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


		function parse3DVector(val) {
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
				var v = parse3DVector(att.position)
				obj.position.set(v.x, v.y, v.z);
			}
			if (att.translation) {
				var v = parse3DVector(att.translation)
				obj.position.set(v.x, v.y, v.z);
			}
			if (att.scale) {
				var v = parse3DVector(att.scale)
				obj.scale.set(v.x, v.y, v.z);
			}
			if (att.rotation) {
				var v = parse3DVector(att.rotation);

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
					obj.scene.traverse(function (node) {

						if (node.isMesh) { node.receiveShadow = true; }

					});
				}

			}
			if (att.shadowdarkness) {
				obj.shadowDarkness = Number(att.shadowdarkness);
            }
		}
		function isNo(n) {
			return !isNaN(parseFloat(n)) && isFinite(n);
		}
		function toN(n, def=1) {
			if (n && isNo(n)) {
				return n;
			}
			return def;
        }
		function toB(b) {
			if (b) {
				if (b == 'true' || b=='1') {
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
			return 180 * radials /Math.PI
        }
	}
	const CameraMode = {
		FIXED: 'fixed',
		LOOKAT: 'lookat',
		SCAN: 'scan',
	}
}
export { ThreeML };
