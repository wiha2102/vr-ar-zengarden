/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as THREE from 'three';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Text } from 'troika-three-text';
import { XR_BUTTONS } from 'gamepad-wrapper';
import { gsap } from 'gsap';
import { init } from './init.js';


const bullets = {};
const forwardVector = new THREE.Vector3(0, 0, -1);
const bulletSpeed = 10;
const bulletTimeToLive = 1;
var moving = false

const blasterGroup = new THREE.Group();
const targets = [];
const movingLights = [];
const drop = []; // NIKKIS WATER TEST

let score = 0;
const scoreText = new Text();
scoreText.fontSize = 0.52;
scoreText.font = 'assets/SpaceMono-Bold.ttf';
scoreText.position.z = -2;
scoreText.color = 0xffa276;
scoreText.anchorX = 'center';
scoreText.anchorY = 'middle';

let laserSound, scoreSound;

let sun = null;
let sunlight = null;


// Remove later (scoreboard)
function updateScoreDisplay() {
	const clampedScore = Math.max(0, Math.min(9999, score));
	const displayScore = clampedScore.toString().padStart(4, '0');
	scoreText.text = displayScore;
	scoreText.sync();
}

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
        new THREE.SphereGeometry(20, 32, 32),
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
    const sunlight = new THREE.SpotLight(0xfff8e8, 3);
    sunlight.position.set(100, 150, -200);
    sunlight.angle = Math.PI / 6;
    sunlight.penumbra = 0.1; // Slightly soft edges
    sunlight.decay = 2;
    sunlight.distance = 500;

    // Enable shadows for the sunlight
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.width = 2048;
    sunlight.shadow.mapSize.height = 2048;
    sunlight.shadow.camera.near = 10; // Near clipping plane
    sunlight.shadow.camera.far = 500; // Far clipping plane

    scene.add(sunlight);

    sunlight.target.position.set(0, 0, 0);
    scene.add(sunlight.target);

    return sunlight;
}


function animateSunlight(sun, sunlight, time) {
    const radius = 50; // Distance from the center
    const speed = 0.05; // Speed of rotation
    const yOffset = 100; // Stay above the horizon

    const x = Math.cos(time * speed) * radius;
    const y = Math.sin(time * speed) * radius + yOffset;
    const z = Math.sin(time * speed) * radius;

    // Update the sun's position
    sun.position.set(x, y, z);

    sunlight.position.set(x, y, z);
    sunlight.target.position.set(0, 0, 0);
    sunlight.target.updateMatrixWorld();
}



function createExplosion(scene, position) {
    const particleCount = 20;
    const particles = [];
    const velocities = [];

    // Generate particles and assign random velocities
    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(
            new THREE.SphereGeometry(0.035, 5, 5), // Small spheres as particles
            new THREE.MeshStandardMaterial({
                color: 0xff4500,
                emissive: 0x553377,
                emissiveIntensity: 8,
            })
        );

        particle.position.copy(position);
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 6,
            (Math.random() - 0.5) * 6,
            (Math.random() - 0.5) * 6
        );

        particles.push(particle);
        velocities.push(velocity);

        scene.add(particle);
    }

    // Particle updatee by time
    const lifespan = 2; // Measureed in Seconds
    const updateParticles = (delta) => {
        for (let i = 0; i < particles.length; i++) {
            const particle = particles[i];
            if (!particle) continue;

            particle.position.add(velocities[i].clone().multiplyScalar(delta));

            // Gradually fade out the particles ovetr time
            const material = particle.material;
            if (material.opacity > 0) {
                material.opacity -= delta / lifespan; // Fade out
                material.transparent = true;
            } else {
                scene.remove(particle);
                particles[i] = null;
            }
        }
    };

    const startTime = performance.now();
    const animateParticles = () => {
        const currentTime = performance.now();
        const elapsedTime = (currentTime - startTime) / 1000;

        if (elapsedTime < lifespan) {
            requestAnimationFrame(animateParticles);
            const delta = 0.016;
            updateParticles(delta);
        } else {
            particles.forEach((particle) => {
                if (particle) {
                    scene.remove(particle);
                    particle.geometry.dispose();
                    particle.material.dispose();
                }
            });
        }
    };
    animateParticles();
}



function handleRaycast(raycaster, scene) {
	const intersects = raycaster.intersectObjects(scene.children);
	if (intersects.length > 0) {
		return intersects[0];
	}
	return null;
}

function setupScene({ scene, camera, renderer, player, controllers }) {
	const gltfLoader = new GLTFLoader();

	gltfLoader.load('assets/garden.glb', (gltf) => {
		const garden = gltf.scene.clone();
		gltf.scene.position.set(0, -1.5, 0);
		scene.add(gltf.scene);
		targets.push(garden);
	
		// Traverse the loaded model to find clickable/interactable objects
		gltf.scene.traverse((child) => {
			if (child.isMesh) {
				child.userData.interactable = true; // Mark as interactable
				child.material = new THREE.MeshStandardMaterial({
					color: child.material.color,
					emissive: new THREE.Color(0x000000),
				});
			}
		});
	});

	sun = addSunSphere(scene);
    sunlight = createSunlight(scene);

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	

	// Maybe change?
	gltfLoader.load('assets/blaster.glb', (gltf) => {
		blasterGroup.add(gltf.scene);
	});

	const directionalLight = new THREE.DirectionalLight( 0xffffff, 0.9 );
	scene.add( directionalLight );

	const light = new THREE.PointLight( 0xbd0ad1, 1, 100 );
	light.position.set( 2, 3, 2 );
	scene.add( light );
	const lightHelper = new THREE.PointLightHelper(light, 1); // 1 is the size of the helper sphere
	scene.add(lightHelper);

	const geometry = new THREE.BoxGeometry(1, 1, 1); 
	const material = new THREE.MeshStandardMaterial({
		color: 0xe3a7ec, 
	});
	const cube = new THREE.Mesh(geometry, material);
	cube.position.set(1,2,3)
	scene.add(cube);

	// Add glowing spherical light sources
/*
    movingLights.push(addLightSource(scene, new THREE.Vector3(2, 1, -1), 0xff0000, 120, 250));
	movingLights.push(addLightSource(scene, new THREE.Vector3(-3, 1.5, -1), 0x00ff00, 120, 250));
	movingLights.push(addLightSource(scene, new THREE.Vector3(1, 2, 1), 0x0000ff, 120, 250));
	movingLights.push(addLightSource(scene, new THREE.Vector3(-2, 5, 2.5), 0xffff00, 120, 250));
	movingLights.push(addLightSource(scene, new THREE.Vector3(0, 3, 1), 0xff00ff, 120, 250));
*/
	// Remove later ----
	gltfLoader.load('assets/target.glb', (gltf) => {
		for (let i = 0; i < 3; i++) {
			const target = gltf.scene.clone();
			target.position.set(
				Math.random() * 2.5 - 2,
				i * 2 + 1,
				-Math.random() * 2 - 1.5,
			);
			scene.add(target);
			targets.push(target);
		}
	});
	scene.add(scoreText);
	scoreText.position.set(0, 0.67, -1.44);
	scoreText.rotateX(-Math.PI / 3.3);
	updateScoreDisplay(); //----

	// Load and set up positional audio
	const listener = new THREE.AudioListener();
	camera.add(listener);
	// Water drop audio
	const audioLoader = new THREE.AudioLoader();
	laserSound = new THREE.PositionalAudio(listener);
	audioLoader.load('assets/water-drop.ogg', (buffer) => {
		laserSound.setBuffer(buffer);
		blasterGroup.add(laserSound);
	});

	// Remove later
	scoreSound = new THREE.PositionalAudio(listener);
	audioLoader.load('assets/score.ogg', (buffer) => {
		scoreSound.setBuffer(buffer);
		scoreText.add(scoreSound);
	});
}


// Create a waterdrop bullet shape (IN PROGRESS)
function createWaterdropBullet() {
	const geometry = new THREE.ConeGeometry(0.05, 0.2, 16); // Base radius, height, radial segments
	const material = new THREE.MeshStandardMaterial({
		color: 0x00bfff, // Aqua color
		emissive: 0x0000ff, // Glow effect
		emissiveIntensity: 0.5,
	});
	const waterdrop = new THREE.Mesh(geometry, material);
	// Rotate the cone to point in the forward direction
	//waterdrop.rotation.x = Math.PI; // Rotate 180 degrees

	return waterdrop;
}


function onFrame( delta, time, { scene, camera, renderer, player, controllers }, ) 
{
	const raycaster = new THREE.Raycaster();
	const tempMatrix = new THREE.Matrix4();
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
		// MOVING THE PLAYER
		const { gamepad } = controllers.left;
		if(gamepad.getButtonDown(XR_BUTTONS.BUTTON_1)){
            moving = true
        }
        if(gamepad.getButtonUp(XR_BUTTONS.BUTTON_1)){
            moving = false
        }
		if (moving) {
			// Move the player forward
			let moveVector = new THREE.Vector3(0, 0, -1);
			moveVector.applyQuaternion(camera.quaternion);
			moveVector.normalize();
			const speed = 1.5; // Movement speed
			player.position.add(moveVector.multiplyScalar(speed * delta));
		}

		// CHANGE OBJECTS WITH A BUTTON CLICK
		if(gamepad.getButtonClick(XR_BUTTONS.BUTTON_2)){
			scene.traverse((child) => {
				console.log(child.name);
			});
			var name = 'Nikkissten_Icosphere002_Material003_0'

			var myObject = scene.getObjectByName(name, true);

			// Check if the object was found
			if (myObject) {
				console.log("Object found:", myObject);
				// Perform operations on the found object
				myObject.material.color.set(0xff0000); // Example: Change its color to red
			} else {
				console.error("Object not found:", name);
				// Handle the case where the object is not found
			}
		}
	} else {
		console.warn("Left controller is not detected.");
	}


	if (controllers.right) {
		const { gamepad, raySpace, mesh } = controllers.right;

		// Prepare the raycaster direction
		tempMatrix.identity().extractRotation(raySpace.matrixWorld);
		raycaster.ray.origin.setFromMatrixPosition(raySpace.matrixWorld);
		raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

		// Perform raycast against all objects in the scene
		const intersects = raycaster.intersectObjects(scene.children, true);
		if (intersects.length > 0) {
			const hitObject = intersects[0].object;

			if (hitObject.material) {
				hitObject.material.color.set(Math.random() * 0xffffff);
			}

			// Scale the object for visual feedback
			gsap.to(hitObject.scale, { x: 1.5, y: 1.5, z: 1.5, duration: 0.3 });
			gsap.to(hitObject.scale, { x: 1, y: 1, z: 1, delay: 0.3, duration: 0.3 });

			if (hitObject.name === 'target') {
				console.log('Hit a target!');
				// Maybe Some Logics into this
			}
		}


		if (!raySpace.children.includes(blasterGroup)) {
			raySpace.add(blasterGroup);
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
			if (laserSound.isPlaying) laserSound.stop();
			laserSound.play();
			// Replace bullet creation logic
			if (gamepad.getButtonClick(XR_BUTTONS.TRIGGER)) {
				try {
					gamepad.getHapticActuator(0).pulse(0.6, 100);
				} catch {
					// Do nothing
				}
				const bullet = createWaterdropBullet();
				scene.add(bullet);
				// Position the waterdrop at the blaster's position
				blasterGroup.getWorldPosition(bullet.position);
				blasterGroup.getWorldQuaternion(bullet.quaternion);
				// Set the velocity and time-to-live for the bullet
				const directionVector = forwardVector.clone().applyQuaternion(bullet.quaternion);
				bullet.userData = {
					velocity: directionVector.multiplyScalar(bulletSpeed),
					timeToLive: bulletTimeToLive,
				};
				bullets[bullet.uuid] = bullet;
			}
		}
	}
	
	// Remove or reuse later
	Object.values(bullets).forEach((bullet) => {
		if (bullet.userData.timeToLive < 0) {
			delete bullets[bullet.uuid];
			scene.remove(bullet);
			return;
		}
		const deltaVec = bullet.userData.velocity.clone().multiplyScalar(delta);
		bullet.position.add(deltaVec);
		bullet.userData.timeToLive -= delta;

		targets
			.filter((target) => target.visible && target.visible)
			.forEach((target) => {
				const distance = target.position.distanceTo(bullet.position);
				if (distance < 1) {
					delete bullets[bullet.uuid];
					scene.remove(bullet);

					// Createw explostions for hte targetes to test ig it works
					createExplosion(scene, target.position);

					gsap.to(target.scale, {
						duration: 0.3,
						x: 0, y: 0, z: 0,
						onComplete: () => {
							target.visible = false;
							setTimeout(() => {
								target.visible = true;
								target.position.x = Math.random() * 10 - 5;
								target.position.z = -Math.random() * 5 - 5;

								// Scale back up the target
								gsap.to(target.scale, {
									duration: 0.3,
									x: 1,
									y: 1,
									z: 1,
								});
							}, 1000);
						},
					});

					score += 10;
					updateScoreDisplay();
					if (scoreSound.isPlaying) scoreSound.stop();
					scoreSound.play();
				}
			});
	});
	gsap.ticker.tick(delta);
}

init(setupScene, onFrame);