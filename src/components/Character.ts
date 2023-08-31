import {
    AbstractMesh,
    AnimationGroup,
    Scene,
    SceneLoader,
    Vector3,
} from "@babylonjs/core";

class Character {
    public scene: Scene;
    public meshes!: AbstractMesh[];
    public animations: AnimationGroup[] = [];

    constructor(scene: Scene) {
        this.scene = scene;
    }

    public async init(): Promise<void> {
        const { meshes, animationGroups } = await SceneLoader.ImportMeshAsync("", "/models/", "character.glb", this.scene);
        this.meshes = meshes;

        // play Idle animation
        // 0: Crouching
        // 1: Idle
        // 2: SneakWalk
        // 3: Walking
        animationGroups[1].start(true, 1.0, animationGroups[1].from, animationGroups[1].to, false);

        meshes[0].position = new Vector3(0, 0, -2);
        meshes[0].scaling.scaleInPlace(1.5);
    }

    public moveForward(): void { }
    public moveBackward(): void { }
    public moveLeft(): void { }
    public moveRight(): void { }
    public jump(): void { }

    public dispose(): void {
        // remove all meshes' animations
        this.animations.forEach(animation => {
            this.scene.stopAnimation(animation);
            animation.dispose();
        });

        this.meshes.forEach(mesh => {
            this.scene.removeMesh(mesh);
            mesh.dispose()
        });
    }
}

export default Character;
