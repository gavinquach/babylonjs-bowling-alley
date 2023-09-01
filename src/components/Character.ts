import {
    AbstractMesh,
    AnimationGroup,
    Scene,
    SceneLoader,
    Vector3,
} from "@babylonjs/core";

class Character {
    public scene: Scene;
    public root!: AbstractMesh;
    public meshes!: AbstractMesh[];
    public animations: AnimationGroup[] = [];

    constructor(scene: Scene) {
        this.scene = scene;
    }

    public async init(): Promise<void> {
        const { meshes, animationGroups } = await SceneLoader.ImportMeshAsync(
            "",
            "/models/",
            "character.glb",
            this.scene,
        );
        this.meshes = meshes;
        this.root = meshes[0];

        // play Idle animation
        // 0: Crouching
        // 1: Idle
        // 2: SneakWalk
        // 3: Walking
        animationGroups[1].start(
            true,
            1.0,
            animationGroups[1].from,
            animationGroups[1].to,
            false,
        );

        this.root.position = new Vector3(0, 0, -2);
        this.root.scaling.scaleInPlace(1.5);
    }

    public dispose(): void {
        // remove all meshes' animations
        this.animations.forEach(animation => {
            this.scene.stopAnimation(animation);
            animation.dispose();
        });

        this.meshes.forEach(mesh => {
            this.scene.removeMesh(mesh);
            mesh.dispose();
        });
    }
}

export default Character;
