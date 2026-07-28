import styles from "./my-recipes.module.scss";

export default function LoadingRecipes() {
  return (
    <main className={`${styles.page} page-shell`} id="main-content">
      <div aria-hidden="true" className={styles.skeleton}>
        <span />
        <span />
        <span />
      </div>
    </main>
  );
}
