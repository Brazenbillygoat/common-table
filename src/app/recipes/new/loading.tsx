import styles from "./start-recipe.module.scss";

export default function LoadingNewRecipe() {
  return (
    <main className={`${styles.page} page-shell`} id="main-content">
      <div aria-hidden="true" className={styles.skeleton}>
        <span className={styles.skeletonHeading} />
        <span className={styles.skeletonInput} />
        <span className={styles.skeletonTextarea} />
        <span className={styles.skeletonInput} />
        <span className={styles.skeletonButton} />
      </div>
    </main>
  );
}
