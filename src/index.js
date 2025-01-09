/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { XR_BUTTONS } from 'gamepad-wrapper';
import { gsap } from 'gsap';
import { init } from './init.js';

const droplets = {};
const forwardVector = new THREE.Vector3(0, 0, -1);
const dropletSpeed = 5;
const dropletTimeToLive = 1;
var moving = false;

const wateringCanGroup = new THREE.Group();
const scissorGroup = new THREE.Group();
const movingLights = [];
let waterdropPrototype = null;
let wateringCan = null;
let scissor = null;

var groundName = "GardenMain_Gardensand_0";
var squirrelName = "wholeSquirrel";
let squirrel = null;
const bigStone = "LargeRock_Rock2_0";
const bigLight = "biglight";
let plants = [];
let waterSound, scissorSound;

let sun = null;
let sunlight = null;


// Light scources
function addLightSource(scene, position, color = 0xffffff, intensity = 1, distance = 10) {
    // Create a sphere geometry to represent the light source
    const sphereGeometry = new THREE.SphereGeometry(0.2, 16, 16); // Adjust size
    const sphereMaterial = new THREE.MeshBasicMaterial({ color }); // Use emissive 
    const lightSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);

    // Position the sphere
    lightSphere.position.copy(position);
    scene.add(lightSphere);

    // Create a point light
    const pointLight = new THREE.PointLight(color, intensity, distance);
    pointLight.position.copy(position);
    scene.add(pointLight);

    const lightGroup = new THREE.Group();
    lightGroup.add(lightSphere);
    lightGroup.add(pointLight);
    scene.add(lightGroup);

    return lightGroup;
}


function addSunSphere(scene) {
	 const sunSphere = new THREE.Mesh(
        new THREE.SphereGeometry(5, 25, 25),
        new THREE.MeshBasicMaterial({
            color: 0xffd700, 		// Golden yellow
            emissive: 0xffaa00, 	// Glow effect
            emissiveIntensity: 5, 	// Bright glow
        })
    );

    sunSphere.position.set(100, 150, -200);
    scene.add(sunSphere);

    return sunSphere;
}


function createSunlight(scene) {
	const sunlight = new THREE.DirectionalLight(0xffffff, 25);
    sunlight.shadow.mapSize.width = 4096;
    sunlight.shadow.mapSize.height = 4096;
    sunlight.shadow.camera.near = 1;
    sunlight.shadow.camera.far = 500;
    sunlight.shadow.camera.left = -200;
    sunlight.shadow.camera.right = 200;
    sunlight.shadow.camera.top = 200;
    sunlight.shadow.camera.bottom = -200;
    sunlight.position.set(100, 150, -200);
    sunlight.angle = Math.PI / 6;
    sunlight.penumbra = 0.1; // Slightly soft edges
    sunlight.decay = 2;
    sunlight.distance = 500;
    sunlight.castShadow = true;
    scene.add(sunlight);
    sunlight.target.position.set(0, 0, 0);
    scene.add(sunlight.target);
    return sunlight;
}


function animateSunlight(sun, sunlight, time) {
    const radius = 25; // Distance from the center
    const speed = 0.01; // Speed of rotation
    const yOffset = 30; // Stay above the horizon

    const x = Math.cos(time * speed) * radius;
    const z = Math.sin(time * speed) * radius;
    const y = yOffset; //Math.sin(time * speed) * radius;

    // Update the sun's position
    sun.position.set(x, y, z);

    sunlight.position.set(x, y, z);
    sunlight.target.position.set(0, 0, 0);
    sunlight.target.updateMatrixWorld();
}

// Create a waterdrop bullet shape (IN PROGRESS)
function createWaterdropBullet() {
    if (!waterdropPrototype) {
        console.warn('Waterdrop model is not yet loaded!');
        return null;
    }
    const waterdrop = waterdropPrototype.clone();
    waterdrop.scale.set(0.05, 0.05, 0.05); 
    waterdrop.rotation.x = Math.PI; // Rotatation
    return waterdrop;
}

function setupScene({ scene, camera, renderer, player, controllers }) {
	const gltfLoader = new GLTFLoader();


	// LIGHT =====================================================================
	sun = addSunSphere(scene);
	sunlight = createSunlight(scene);
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	scene.environment = null;
	const ambientLight = new THREE.AmbientLight(0x404040, 20);
	scene.add(ambientLight);
	scene.background = new THREE.Color(0xADD8E6); // Dark blue

	//const lightHelpe = new THREE.DirectionalLightHelper(sunlight, 10);
    //scene.add(lightHelpe);
    //const shadowCameraHelpe = new THREE.CameraHelper(sunlight.shadow.camera);
    //scene.add(shadowCameraHelpe);


	// Load the whole model 
	gltfLoader.load('assets/garden.glb', (gltf) => {
        const garden = gltf.scene.clone();
        garden.position.set(0, 0, 0);
        scene.add(garden);

        garden.traverse((child) => {
			if (child.isMesh) {
				child.receiveShadow = true; 
				child.castShadow = true;    
			}			
			if (['p1', 'p2', 'p3', 'p4', 'tree', 'b1', 'b2', 'b3'].includes(child.name)) {
				console.log(`Found plant: ${child.name}`);
				plants.push(child); 
			}
            if (child.name === bigLight) {
                if (child.isLight) {
                    console.log("Found Blender light:", child);
                    child.intensity = 2; // ??
                    child.color = new THREE.Color(0xffeedd);
                    child.position.set(100, 200, -50);
                    if (child.castShadow !== undefined) {
                        child.castShadow = true;
                        child.shadow.mapSize.width = 2048;
                        child.shadow.mapSize.height = 2048;
                    }
                    scene.add(child);
                }
            }
			if (child.name === squirrelName) {
				child.visible = false;
				squirrel = child;
				scene.add(squirrel);
			}
			if (child.name === "Light") {
				child.visible = false;
			}
			if (child.name === groundName){
				const groundObject = scene.getObjectByName(groundName);
				groundObject.material.color.set(0x8B7765); // Set a darker color
				groundObject.material.emissive.set(0x000000); // Remove emissive light
				groundObject.material.roughness = 1; // Increase roughness to reduce shininess
				groundObject.material.metalness = 0;
			}
        });
    });

	// Watering can
	gltfLoader.load('assets/watering_can.glb', (gltf) => {
		wateringCan = gltf.scene;
		wateringCan.scale.set(0.5,0.5,0.5);
		wateringCan.rotation.x = Math.PI;
		wateringCan.rotation.z = Math.PI;
		wateringCan.position.y -= 0.2;
		wateringCanGroup.add(gltf.scene);
	});

	// Scissors
	gltfLoader.load('assets/garden_scissors.glb', (gltf) => {
		scissor = gltf.scene;
		scissor.scale.set(0.0015,0.0015,0.0015);
		scissor.rotation.x = -Math.PI/2;
		scissor.rotation.z = Math.PI/2;
		//scissor.position.y -= 0.2;
		scissorGroup.add(gltf.scene);
	});

	// Waterdrop
	gltfLoader.load('assets/drop_of_water.glb', (gltf) => {
		waterdropPrototype = gltf.scene;
		console.log('Waterdrop model loaded successfully!');
	});

	// Set standard player position (to avoid big rock)
	player.position.x=2;
	player.position.z=2;

	
	
	// ---== Light Balls ==--- //

	addLightSource(scene, new THREE.Vector3(8, 5, -10), 0xffc0cb, 10, 10); // Bluish Light
	addLightSource(scene, new THREE.Vector3(8, 5, 10), 0xffc0cb, 10, 10);	// Greensish Light
	addLightSource(scene, new THREE.Vector3(8, 5, 0), 0xffc0cb, 10, 10); // redusg Light
	addLightSource(scene, new THREE.Vector3(-8, 5, -10), 0xffc0cb, 10, 10); // magenta Light
	addLightSource(scene, new THREE.Vector3(-8, 5, 10), 0xffc0cb, 10, 10); //  orange Light
	addLightSource(scene, new THREE.Vector3(-8, 5, 0), 0xffc0cb, 10, 10); // pink Light
	addLightSource(scene, new THREE.Vector3(0, 5, -10), 0xffc0cb, 10, 10); // Blue Light
	addLightSource(scene, new THREE.Vector3(0, 5, 10), 0xffc0cb, 10, 10); // Green Light

	// Load and set up positional audio
	const listener = new THREE.AudioListener();
	camera.add(listener);
	// Water drop audio
	const audioLoader = new THREE.AudioLoader();
	waterSound = new THREE.PositionalAudio(listener);
	audioLoader.load('assets/water-drop.ogg', (buffer) => {
		waterSound.setBuffer(buffer);
		wateringCanGroup.add(waterSound);
	});
	// Scissor audio
	scissorSound = new THREE.PositionalAudio(listener);
	audioLoader.load('assets/rusty-blade-slice.ogg', (buffer) => {
		scissorSound.setBuffer(buffer);
		scissorGroup.add(scissorSound);
	});
}


function onFrame( delta, time, { scene, camera, renderer, player, controllers }, ) 
{
	const raycaster = new THREE.Raycaster();
	const tempMatrix = new THREE.Matrix4();

	// Player postition
	if (player.position.y !== 0) {
    	player.position.y = 0;
	}
	
	/*
	movingLights.forEach((lightGroup, index) => {
        const speed = 0.5 + index * 0.75; // Vary speed
        const radius = 1.5 + index; // Vary radius
        const angle = time * speed * 2; // Angle depends
        lightGroup.position.x = Math.cos(angle) * radius;
        lightGroup.position.z = Math.sin(angle) * radius * .25;
        lightGroup.position.y = 1 + Math.sin(time * speed) * 0.25;
    });
	*/

	if (sun && sunlight) { animateSunlight(sun, sunlight, time); }

	if (controllers.left) {
		const { gamepad, raySpace, mesh } = controllers.left;

		// Prepare the raycaster direction
		tempMatrix.identity().extractRotation(raySpace.matrixWorld);
		raycaster.ray.origin.setFromMatrixPosition(raySpace.matrixWorld);
		raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

		// Perform raycast against all objects in the scene
		const intersects = raycaster.intersectObjects(scene.children, true);
		if (intersects.length > 0) {
			const hitObject = intersects[0].object;
			if (hitObject.name === bigStone){
				squirrel.position.y = 0;
				squirrel.position.x = 2;
				squirrel.position.z = 2;
				squirrel.scale.x = 0.05;
				squirrel.scale.y = 0.05;
				squirrel.scale.z = 0.05;
				squirrel.rotation.x = -Math.PI/2;
				squirrel.visible = true;
			}
		}

		// MOVING THE PLAYER
		if(gamepad.getButtonDown(XR_BUTTONS.BUTTON_1)){
            moving = true
        }
        if(gamepad.getButtonUp(XR_BUTTONS.BUTTON_1)){
            moving = false
        }
		if (moving) {
			let moveVector = new THREE.Vector3(0, 0, -1);
			moveVector.applyQuaternion(camera.quaternion);
			moveVector.normalize();
			const speed = 2.5; // Movement speed
			player.position.add(moveVector.multiplyScalar(speed * delta));
		}

		// CHANGE OBJECTS WITH A BUTTON CLICK (for the big stone?)
		if(gamepad.getButtonClick(XR_BUTTONS.BUTTON_2)){
			scene.traverse((child) => {
				console.log(child.name);
			});
			var name = 'Nikkissten_Icosphere002_Material003_0'
			var myObject = scene.getObjectByName(bigStone, true);

			// Check if the object was found
			if (myObject) {
				console.log("Object found:", myObject);
				// Perform operations on the found object
				myObject.material.color.set(0xff0000); // Example: Change its color to red
			} else {
				console.error("Object not found:", bigStone);
				// Handle the case where the object is not found
			}
		}

		// APPERENCE
		if (!raySpace.children.includes(scissorGroup)) {
			raySpace.add(scissorGroup);
			mesh.visible = false;
		}

		// Using the scissor AND PLAY A SOUND
		if (gamepad.getButtonClick(XR_BUTTONS.TRIGGER)) {
			try {
				gamepad.getHapticActuator(0).pulse(0.6, 100);
			} catch {
				// do nothing
			}
			// Play scissor sound
			if (scissorSound.isPlaying) scissorSound.stop();
			scissorSound.play();

			const scissorPosition = new THREE.Vector3();
			scissorGroup.getWorldPosition(scissorPosition);
			const scissorSphere = new THREE.Sphere(scissor.position, 0.1);
			plants.forEach(plant => {
				const plantBoxen2 = new THREE.Box3().setFromObject(plant);
				if (plantBoxen2.intersectsSphere(scissorSphere)) {
					console.log('Collision detected with plant!');
					// Scale down the plant
					gsap.to(plant.scale, {
						duration: 2,
						x: plant.scale.x * 0.2,
						y: plant.scale.y * 0.2,
						z: plant.scale.z * 0.2,
					});
					console.log('Plant got small!');
				}
			});
		}
	} else {
		console.warn("Left controller is not detected.");
	}

	if (controllers.right) {
		const { gamepad, raySpace, mesh } = controllers.right;

		if (!raySpace.children.includes(wateringCanGroup)) {
			raySpace.add(wateringCanGroup);
			mesh.visible = false;
		}

		// SHOOT A WATERDROP AND PLAY A SOUND
		if (gamepad.getButtonClick(XR_BUTTONS.TRIGGER)) {
			try {
				gamepad.getHapticActuator(0).pulse(0.6, 100);
			} catch {
				// do nothing
			}
			// Play water sound
			if (waterSound.isPlaying) waterSound.stop();
			waterSound.play();
			
			const droplet = createWaterdropBullet();
			scene.add(droplet);
			// Position the waterdrop at the blaster's position
			wateringCanGroup.getWorldPosition(droplet.position);
			wateringCanGroup.getWorldQuaternion(droplet.quaternion);
			// Set the velocity and time-to-live for the bullet
			const directionVector = forwardVector.clone().applyQuaternion(droplet.quaternion);
			droplet.userData = {
				velocity: directionVector.multiplyScalar(dropletSpeed),
				timeToLive: dropletTimeToLive,
			};
			droplets[droplet.uuid] = droplet;
			
		}
	}
	
	// Action for when a waterdrop hits an object
	Object.values(droplets).forEach((droplet) => {
		if (droplet.userData.timeToLive < 0) {
			delete droplets[droplet.uuid];
			scene.remove(droplet);
			return;
		}
		const deltaVec = droplet.userData.velocity.clone().multiplyScalar(delta);
		droplet.position.add(deltaVec);
		droplet.userData.timeToLive -= delta;

		const bulletSphere = new THREE.Sphere(droplet.position, 0.1);
		plants.forEach(plant => {
			const plantBoxen = new THREE.Box3().setFromObject(plant);
			if (plantBoxen.intersectsSphere(bulletSphere)) {
				console.log('Collision detected with plant!');
	
				// Remove the bullet
				delete droplets[droplet.uuid];
				scene.remove(droplet);
	
				// Scale up the plant
				gsap.to(plant.scale, {
					duration: 2,
					x: plant.scale.x * 1.2,
					y: plant.scale.y * 1.2,
					z: plant.scale.z * 1.2,
				});
				console.log('Plant grew!');
			}
		});
		
	});
	gsap.ticker.tick(delta);
}

init(setupScene, onFrame);